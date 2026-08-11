-- Change recalculate_student_scores to take a student directly (not a
-- submission), and fold game_score.points into the weekly/monthly total.
-- Must DROP first: Postgres won't let CREATE OR REPLACE rename a parameter.
--
-- Call sites updated in the same change:
--   src/pages/StudentAssignmentSubmit.jsx        (was p_submission_id)
--   supabase/functions/whisper-failsafe/index.ts (was p_submission_id; redeployed v11)
--   src/lib/games/wfComplete.js                  (new caller)

DROP FUNCTION IF EXISTS public.recalculate_student_scores(uuid);

CREATE FUNCTION public.recalculate_student_scores(p_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := p_student_id;
  v_school_id uuid;
  v_week_start date;
  v_month_start date;
  v_teacher_score_total int;
  v_total_words int;
  v_all_transcripts text;
  v_unique_words int;
  v_game_points_total int;
  v_total_score int;
BEGIN
  -- 1. Identify school directly from the student's profile.
  SELECT p.school_id
  INTO v_school_id
  FROM public.profiles p
  WHERE p.id = v_student_id;

  -- 2. Define Period Boundaries (Standard DB Time)
  v_week_start  := date_trunc('week', now())::date;
  v_month_start := date_trunc('month', now())::date;

  -- 3. PROCESS WEEKLY SCORES
  SELECT COALESCE(SUM(a.teacher_score), 0)
  INTO v_teacher_score_total
  FROM public.submissions s
  JOIN public.assignments a ON a.id = s.assignment_id
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_week_start
    AND s.submitted_at < v_week_start + interval '7 days';

  SELECT COALESCE(SUM(s.total_words), 0)
  INTO v_total_words
  FROM public.submissions s
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_week_start
    AND s.submitted_at < v_week_start + interval '7 days';

  SELECT string_agg(s.transcript, ' ')
  INTO v_all_transcripts
  FROM public.submissions s
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_week_start
    AND s.submitted_at < v_week_start + interval '7 days'
    AND s.transcript IS NOT NULL;

  SELECT COUNT(DISTINCT word)::int
  INTO v_unique_words
  FROM unnest(string_to_array(lower(regexp_replace(COALESCE(v_all_transcripts,''),'[^a-zA-Z\s]','','g')), ' ')) AS word
  WHERE word != '';

  SELECT COALESCE(SUM(gs.points), 0)
  INTO v_game_points_total
  FROM public.game_score gs
  WHERE gs.student_id = v_student_id
    AND gs.played_at >= v_week_start
    AND gs.played_at < v_week_start + interval '7 days';

  v_total_score := v_teacher_score_total + (v_total_words * 1) + (v_unique_words * 3) + v_game_points_total;

  INSERT INTO public.scores (
    student_id, school_id, period_type, period_start,
    teacher_score_total, total_words, unique_words, total_score, updated_at
  ) VALUES (
    v_student_id, v_school_id, 'weekly', v_week_start,
    v_teacher_score_total, v_total_words, v_unique_words, v_total_score, now()
  )
  ON CONFLICT (student_id, school_id, period_type, period_start)
  DO UPDATE SET
    teacher_score_total = EXCLUDED.teacher_score_total,
    total_words = EXCLUDED.total_words,
    unique_words = EXCLUDED.unique_words,
    total_score = EXCLUDED.total_score,
    updated_at = now();

  -- 4. PROCESS MONTHLY SCORES
  SELECT COALESCE(SUM(a.teacher_score), 0)
  INTO v_teacher_score_total
  FROM public.submissions s
  JOIN public.assignments a ON a.id = s.assignment_id
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_month_start
    AND s.submitted_at < v_month_start + interval '1 month';

  SELECT COALESCE(SUM(s.total_words), 0)
  INTO v_total_words
  FROM public.submissions s
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_month_start
    AND s.submitted_at < v_month_start + interval '1 month';

  SELECT string_agg(s.transcript, ' ')
  INTO v_all_transcripts
  FROM public.submissions s
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_month_start
    AND s.submitted_at < v_month_start + interval '1 month'
    AND s.transcript IS NOT NULL;

  SELECT COUNT(DISTINCT word)::int
  INTO v_unique_words
  FROM unnest(string_to_array(lower(regexp_replace(COALESCE(v_all_transcripts,''),'[^a-zA-Z\s]','','g')), ' ')) AS word
  WHERE word != '';

  SELECT COALESCE(SUM(gs.points), 0)
  INTO v_game_points_total
  FROM public.game_score gs
  WHERE gs.student_id = v_student_id
    AND gs.played_at >= v_month_start
    AND gs.played_at < v_month_start + interval '1 month';

  v_total_score := v_teacher_score_total + (v_total_words * 1) + (v_unique_words * 3) + v_game_points_total;

  INSERT INTO public.scores (
    student_id, school_id, period_type, period_start,
    teacher_score_total, total_words, unique_words, total_score, updated_at
  ) VALUES (
    v_student_id, v_school_id, 'monthly', v_month_start,
    v_teacher_score_total, v_total_words, v_unique_words, v_total_score, now()
  )
  ON CONFLICT (student_id, school_id, period_type, period_start)
  DO UPDATE SET
    teacher_score_total = EXCLUDED.teacher_score_total,
    total_words = EXCLUDED.total_words,
    unique_words = EXCLUDED.unique_words,
    total_score = EXCLUDED.total_score,
    updated_at = now();

  -- 5. SYNC RANKS TO LEADERBOARD TABLES
  PERFORM public.update_all_leaderboard_ranks(v_school_id, v_week_start, v_month_start);

END;
$function$;
