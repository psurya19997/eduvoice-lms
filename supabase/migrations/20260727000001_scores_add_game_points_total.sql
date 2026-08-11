-- Persist game_points as its own column on scores so the leaderboard
-- BreakdownCard (Teacher + Word + Unique + Game) sums to Total.
-- Backfill existing rows from game_score for the row's period window,
-- then redeploy recalculate_student_scores to write it going forward.

ALTER TABLE public.scores
  ADD COLUMN IF NOT EXISTS game_points_total int NOT NULL DEFAULT 0;

UPDATE public.scores s
SET game_points_total = COALESCE(sub.pts, 0)
FROM (
  SELECT
    sc.student_id,
    sc.period_type,
    sc.period_start,
    SUM(gs.points) AS pts
  FROM public.scores sc
  JOIN public.game_score gs ON gs.student_id = sc.student_id
   AND gs.played_at >= sc.period_start
   AND gs.played_at < CASE
     WHEN sc.period_type = 'weekly'  THEN sc.period_start + interval '7 days'
     WHEN sc.period_type = 'monthly' THEN sc.period_start + interval '1 month'
   END
  GROUP BY sc.student_id, sc.period_type, sc.period_start
) sub
WHERE s.student_id   = sub.student_id
  AND s.period_type  = sub.period_type
  AND s.period_start = sub.period_start;

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
  SELECT p.school_id INTO v_school_id
  FROM public.profiles p
  WHERE p.id = v_student_id;

  v_week_start  := date_trunc('week',  now())::date;
  v_month_start := date_trunc('month', now())::date;

  -- WEEKLY
  SELECT COALESCE(SUM(a.teacher_score), 0) INTO v_teacher_score_total
  FROM public.submissions s
  JOIN public.assignments a ON a.id = s.assignment_id
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_week_start
    AND s.submitted_at <  v_week_start + interval '7 days';

  SELECT COALESCE(SUM(s.total_words), 0) INTO v_total_words
  FROM public.submissions s
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_week_start
    AND s.submitted_at <  v_week_start + interval '7 days';

  SELECT string_agg(s.transcript, ' ') INTO v_all_transcripts
  FROM public.submissions s
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_week_start
    AND s.submitted_at <  v_week_start + interval '7 days'
    AND s.transcript IS NOT NULL;

  SELECT COUNT(DISTINCT word)::int INTO v_unique_words
  FROM unnest(string_to_array(lower(regexp_replace(COALESCE(v_all_transcripts,''),'[^a-zA-Z\s]','','g')), ' ')) AS word
  WHERE word != '';

  SELECT COALESCE(SUM(gs.points), 0) INTO v_game_points_total
  FROM public.game_score gs
  WHERE gs.student_id = v_student_id
    AND gs.played_at >= v_week_start
    AND gs.played_at <  v_week_start + interval '7 days';

  v_total_score := v_teacher_score_total + (v_total_words * 1) + (v_unique_words * 3) + v_game_points_total;

  INSERT INTO public.scores (
    student_id, school_id, period_type, period_start,
    teacher_score_total, total_words, unique_words, game_points_total,
    total_score, updated_at
  ) VALUES (
    v_student_id, v_school_id, 'weekly', v_week_start,
    v_teacher_score_total, v_total_words, v_unique_words, v_game_points_total,
    v_total_score, now()
  )
  ON CONFLICT (student_id, school_id, period_type, period_start)
  DO UPDATE SET
    teacher_score_total = EXCLUDED.teacher_score_total,
    total_words         = EXCLUDED.total_words,
    unique_words        = EXCLUDED.unique_words,
    game_points_total   = EXCLUDED.game_points_total,
    total_score         = EXCLUDED.total_score,
    updated_at          = now();

  -- MONTHLY
  SELECT COALESCE(SUM(a.teacher_score), 0) INTO v_teacher_score_total
  FROM public.submissions s
  JOIN public.assignments a ON a.id = s.assignment_id
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_month_start
    AND s.submitted_at <  v_month_start + interval '1 month';

  SELECT COALESCE(SUM(s.total_words), 0) INTO v_total_words
  FROM public.submissions s
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_month_start
    AND s.submitted_at <  v_month_start + interval '1 month';

  SELECT string_agg(s.transcript, ' ') INTO v_all_transcripts
  FROM public.submissions s
  WHERE s.student_id = v_student_id
    AND s.submitted_at >= v_month_start
    AND s.submitted_at <  v_month_start + interval '1 month'
    AND s.transcript IS NOT NULL;

  SELECT COUNT(DISTINCT word)::int INTO v_unique_words
  FROM unnest(string_to_array(lower(regexp_replace(COALESCE(v_all_transcripts,''),'[^a-zA-Z\s]','','g')), ' ')) AS word
  WHERE word != '';

  SELECT COALESCE(SUM(gs.points), 0) INTO v_game_points_total
  FROM public.game_score gs
  WHERE gs.student_id = v_student_id
    AND gs.played_at >= v_month_start
    AND gs.played_at <  v_month_start + interval '1 month';

  v_total_score := v_teacher_score_total + (v_total_words * 1) + (v_unique_words * 3) + v_game_points_total;

  INSERT INTO public.scores (
    student_id, school_id, period_type, period_start,
    teacher_score_total, total_words, unique_words, game_points_total,
    total_score, updated_at
  ) VALUES (
    v_student_id, v_school_id, 'monthly', v_month_start,
    v_teacher_score_total, v_total_words, v_unique_words, v_game_points_total,
    v_total_score, now()
  )
  ON CONFLICT (student_id, school_id, period_type, period_start)
  DO UPDATE SET
    teacher_score_total = EXCLUDED.teacher_score_total,
    total_words         = EXCLUDED.total_words,
    unique_words        = EXCLUDED.unique_words,
    game_points_total   = EXCLUDED.game_points_total,
    total_score         = EXCLUDED.total_score,
    updated_at          = now();

  PERFORM public.update_all_leaderboard_ranks(v_school_id, v_week_start, v_month_start);
END;
$function$;
