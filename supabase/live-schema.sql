-- ============================================================================
-- EduVoice LMS — LIVE SCHEMA SNAPSHOT
-- Project: xlqnueqyqesfqwkbpwud ("eduvoice-lms")
-- Org:     dxsogyrhxpatjgkxwomz
-- Region:  ap-northeast-1
-- DB:      Postgres 17.6.1.104, timezone UTC
-- Captured: 2026-07-24 via Supabase MCP (execute_sql over pg_catalog /
--           information_schema / storage.buckets / cron.job)
--
-- IMPORTANT:
--   This file is a SNAPSHOT OF WHAT'S LIVE, not a migration. It is not
--   tracked by Supabase's migration system (`list_migrations` on this
--   project returns empty — the live schema was built by hand via the
--   SQL editor / dashboard).
--
--   Do NOT run this file wholesale against the live DB. It's here as
--   the authoritative reference for what's actually deployed.
--
--   RLS is DISABLED on every table in public. All access control lives
--   in the React client (see docs/09-security-and-risks.md).
--
--   Previous, drifted files have been moved to docs-archive/:
--     - supabase-schema-stale.sql              (former supabase/schema.sql)
--     - supabase-storage-stale.sql             (former supabase/storage.sql)
--     - supabase-migrations-unapplied/         (former supabase/migrations/*)
--     - supabase-functions-undeployed/         (former process-period-end/)
--     - supabase-functions-improvements-not-deployed/  (better whisper-failsafe)
-- ============================================================================


-- ============================================================================
-- 1. TABLES
-- ============================================================================

CREATE TABLE public.schools (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  is_active                boolean NOT NULL DEFAULT true,
  require_teacher_approval boolean NOT NULL DEFAULT true,
  created_at               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT schools_pkey     PRIMARY KEY (id),
  CONSTRAINT schools_name_key UNIQUE (name)
);

CREATE TABLE public.profiles (
  id           uuid NOT NULL,
  first_name   text NOT NULL,
  last_name    text NOT NULL,
  phone        text,
  email        text,
  role         text NOT NULL,
  school_id    uuid,
  class        integer,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  disabled_at  timestamp with time zone,
  CONSTRAINT profiles_pkey        PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey     FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE RESTRICT,
  CONSTRAINT profiles_role_check  CHECK (role = ANY (ARRAY['super_admin','principal','teacher','student'])),
  CONSTRAINT profiles_class_check CHECK ((class >= 1) AND (class <= 12)),
  -- Enforces the split: students have phone+school_id+class, no email; staff have email, no phone/school_id/class.
  CONSTRAINT profiles_student_fields_ck CHECK (
    ((role = 'student') AND (phone IS NOT NULL) AND (school_id IS NOT NULL) AND (class IS NOT NULL) AND (email IS NULL))
    OR
    ((role IN ('teacher','principal','super_admin')) AND (email IS NOT NULL) AND (phone IS NULL) AND (school_id IS NULL) AND (class IS NULL))
  )
);

-- Partial unique indexes (created as indexes, not table constraints):
CREATE UNIQUE INDEX profiles_email_unique_idx   ON public.profiles (email) WHERE (email IS NOT NULL);
CREATE UNIQUE INDEX profiles_student_unique_idx ON public.profiles (phone, first_name, school_id) WHERE (role = 'student');
CREATE INDEX profiles_role_idx    ON public.profiles (role);
CREATE INDEX profiles_school_idx  ON public.profiles (school_id) WHERE (school_id IS NOT NULL);


CREATE TABLE public.teacher_schools (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id   uuid NOT NULL,
  school_id    uuid NOT NULL,
  is_approved  boolean NOT NULL DEFAULT false,
  is_active    boolean NOT NULL DEFAULT true,
  joined_at    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT teacher_schools_pkey            PRIMARY KEY (id),
  CONSTRAINT teacher_schools_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT teacher_schools_school_id_fkey  FOREIGN KEY (school_id)  REFERENCES public.schools(id)  ON DELETE CASCADE,
  CONSTRAINT teacher_schools_unique          UNIQUE (teacher_id, school_id)
);

CREATE INDEX teacher_schools_teacher_idx ON public.teacher_schools (teacher_id);
CREATE INDEX teacher_schools_school_idx  ON public.teacher_schools (school_id);


CREATE TABLE public.courses (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id   uuid NOT NULL,
  school_id    uuid NOT NULL,
  title        text NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT courses_pkey                PRIMARY KEY (id),
  CONSTRAINT courses_teacher_id_fkey     FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT courses_school_id_fkey      FOREIGN KEY (school_id)  REFERENCES public.schools(id)  ON DELETE CASCADE,
  CONSTRAINT courses_title_school_unique UNIQUE (title, school_id)
);

CREATE INDEX courses_teacher_idx ON public.courses (teacher_id);
CREATE INDEX courses_school_idx  ON public.courses (school_id);


CREATE TABLE public.course_classes (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL,
  class      integer NOT NULL,
  CONSTRAINT course_classes_pkey          PRIMARY KEY (id),
  CONSTRAINT course_classes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE,
  CONSTRAINT course_classes_class_check   CHECK ((class >= 1) AND (class <= 12)),
  CONSTRAINT course_classes_unique        UNIQUE (course_id, class)
);

CREATE INDEX course_classes_course_idx ON public.course_classes (course_id);
CREATE INDEX course_classes_class_idx  ON public.course_classes (class);


CREATE TABLE public.assignments (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id                uuid NOT NULL,
  title                    text NOT NULL,
  instructions             text,
  instruction_file_url     text,
  instruction_type         text,
  allowed_submission_types text[] NOT NULL,
  due_date                 timestamp with time zone NOT NULL,
  accept_late_submissions  boolean NOT NULL DEFAULT false,
  teacher_score            integer NOT NULL,
  is_live                  boolean NOT NULL DEFAULT true,
  created_at               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assignments_pkey                          PRIMARY KEY (id),
  CONSTRAINT assignments_course_id_fkey                FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE,
  CONSTRAINT assignments_instruction_type_check        CHECK (instruction_type = ANY (ARRAY['text','image','audio','pdf','link'])),
  CONSTRAINT assignments_allowed_submission_types_check CHECK ((array_length(allowed_submission_types, 1) >= 1) AND (allowed_submission_types <@ ARRAY['text','image','audio'])),
  CONSTRAINT assignments_teacher_score_check           CHECK (teacher_score >= 0)
);

CREATE INDEX assignments_course_idx   ON public.assignments (course_id);
CREATE INDEX assignments_due_date_idx ON public.assignments (due_date);
CREATE INDEX assignments_is_live_idx  ON public.assignments (is_live);


CREATE TABLE public.assignment_classes (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id  uuid NOT NULL,
  class          integer NOT NULL,
  CONSTRAINT assignment_classes_pkey               PRIMARY KEY (id),
  CONSTRAINT assignment_classes_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE,
  CONSTRAINT assignment_classes_class_check        CHECK ((class >= 1) AND (class <= 12)),
  CONSTRAINT assignment_classes_unique             UNIQUE (assignment_id, class)
);

CREATE INDEX assignment_classes_assignment_idx ON public.assignment_classes (assignment_id);
CREATE INDEX assignment_classes_class_idx      ON public.assignment_classes (class);


CREATE TABLE public.submissions (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL,
  student_id      uuid NOT NULL,
  submission_type text NOT NULL,
  text_content    text,
  file_url        text,
  transcript      text,
  total_words     integer,
  unique_words    integer,
  is_visible      boolean NOT NULL DEFAULT true,
  submitted_at    timestamp with time zone NOT NULL DEFAULT now(),
  audio_duration  double precision DEFAULT 0,
  retry_count     integer          DEFAULT 0,
  CONSTRAINT submissions_pkey                   PRIMARY KEY (id),
  CONSTRAINT submissions_assignment_id_fkey     FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE,
  CONSTRAINT submissions_student_id_fkey        FOREIGN KEY (student_id)    REFERENCES public.profiles(id)   ON DELETE CASCADE,
  CONSTRAINT submissions_submission_type_check  CHECK (submission_type = ANY (ARRAY['text','image','audio'])),
  CONSTRAINT submissions_total_words_check      CHECK (total_words  >= 0),
  CONSTRAINT submissions_unique_words_check     CHECK (unique_words >= 0),
  -- Enforces "text needs text_content; image/audio need file_url":
  CONSTRAINT submissions_payload_ck CHECK (
    ((submission_type = 'text')  AND (text_content IS NOT NULL))
    OR ((submission_type = 'image') AND (file_url IS NOT NULL))
    OR ((submission_type = 'audio') AND (file_url IS NOT NULL))
  ),
  CONSTRAINT submissions_unique_per_student UNIQUE (assignment_id, student_id)
);

CREATE INDEX submissions_assignment_idx ON public.submissions (assignment_id);
CREATE INDEX submissions_student_idx    ON public.submissions (student_id);
CREATE INDEX submissions_visible_idx    ON public.submissions (is_visible);
-- Partial index used by whisper-failsafe's stuck-file lookup:
CREATE INDEX idx_submissions_stuck_files
  ON public.submissions (submission_type, transcript, retry_count)
  WHERE (transcript IS NULL);


CREATE TABLE public.scores (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id           uuid NOT NULL,
  school_id            uuid NOT NULL,
  period_type          text NOT NULL,
  period_start         date NOT NULL,
  teacher_score_total  integer NOT NULL DEFAULT 0,
  total_words          integer NOT NULL DEFAULT 0,
  unique_words         integer NOT NULL DEFAULT 0,
  total_score          integer NOT NULL DEFAULT 0,
  updated_at           timestamp with time zone DEFAULT now(),
  CONSTRAINT scores_pkey                PRIMARY KEY (id),
  CONSTRAINT scores_student_id_fkey     FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT scores_school_id_fkey      FOREIGN KEY (school_id)  REFERENCES public.schools(id)  ON DELETE CASCADE,
  CONSTRAINT scores_period_type_check   CHECK (period_type = ANY (ARRAY['weekly','monthly'])),
  CONSTRAINT scores_student_id_school_id_period_type_period_start_key UNIQUE (student_id, school_id, period_type, period_start)
);


CREATE TABLE public.leaderboard_weekly (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL,
  school_id     uuid NOT NULL,
  period_start  date NOT NULL,
  total_score   integer NOT NULL DEFAULT 0,
  rank          integer,
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT leaderboard_weekly_pkey             PRIMARY KEY (id),
  CONSTRAINT leaderboard_weekly_student_id_fkey  FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT leaderboard_weekly_school_id_fkey   FOREIGN KEY (school_id)  REFERENCES public.schools(id)  ON DELETE CASCADE,
  CONSTRAINT leaderboard_weekly_rank_check       CHECK (rank >= 1),
  CONSTRAINT leaderboard_weekly_total_score_check CHECK (total_score >= 0),
  CONSTRAINT leaderboard_weekly_unique           UNIQUE (student_id, school_id, period_start)
);

CREATE INDEX leaderboard_weekly_school_period_idx
  ON public.leaderboard_weekly (school_id, period_start, total_score DESC);


CREATE TABLE public.leaderboard_monthly (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL,
  school_id     uuid NOT NULL,
  period_start  date NOT NULL,
  total_score   integer NOT NULL DEFAULT 0,
  rank          integer,
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT leaderboard_monthly_pkey             PRIMARY KEY (id),
  CONSTRAINT leaderboard_monthly_student_id_fkey  FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT leaderboard_monthly_school_id_fkey   FOREIGN KEY (school_id)  REFERENCES public.schools(id)  ON DELETE CASCADE,
  CONSTRAINT leaderboard_monthly_rank_check       CHECK (rank >= 1),
  CONSTRAINT leaderboard_monthly_unique           UNIQUE (student_id, school_id, period_start)
);
-- NOTE: No `(school_id, period_start, total_score DESC)` index on monthly,
-- unlike weekly. Not currently a hotspot per row counts, but worth knowing.


CREATE TABLE public.class_change_requests (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL,
  school_id        uuid NOT NULL,
  current_class    integer NOT NULL,
  requested_class  integer NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  requested_at     timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at      timestamp with time zone,
  CONSTRAINT class_change_requests_pkey                    PRIMARY KEY (id),
  CONSTRAINT class_change_requests_student_id_fkey         FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT class_change_requests_school_id_fkey          FOREIGN KEY (school_id)  REFERENCES public.schools(id)  ON DELETE CASCADE,
  CONSTRAINT class_change_requests_current_class_check     CHECK ((current_class   >= 1) AND (current_class   <= 12)),
  CONSTRAINT class_change_requests_requested_class_check   CHECK ((requested_class >= 1) AND (requested_class <= 12)),
  CONSTRAINT class_change_requests_different_class_ck      CHECK (current_class <> requested_class),
  CONSTRAINT class_change_requests_status_check            CHECK (status = ANY (ARRAY['pending','approved','rejected']))
);

CREATE INDEX class_change_requests_school_idx ON public.class_change_requests (school_id);
CREATE INDEX class_change_requests_status_idx ON public.class_change_requests (status);
-- Enforces "one pending request per student":
CREATE UNIQUE INDEX class_change_requests_one_pending_idx
  ON public.class_change_requests (student_id)
  WHERE (status = 'pending');


CREATE TABLE public.badges (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL,
  school_id       uuid NOT NULL,
  badge_type      text NOT NULL,
  count           integer NOT NULL DEFAULT 0,
  last_earned_at  timestamp with time zone,
  CONSTRAINT badges_pkey              PRIMARY KEY (id),
  CONSTRAINT badges_student_id_fkey   FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT badges_school_id_fkey    FOREIGN KEY (school_id)  REFERENCES public.schools(id)  ON DELETE CASCADE,
  CONSTRAINT badges_badge_type_check  CHECK (badge_type = ANY (ARRAY['weekly_streak','monthly_streak','weekly_top5','monthly_top5'])),
  CONSTRAINT badges_count_check       CHECK (count >= 0),
  -- What makes award_badge_idempotent's `ON CONFLICT (student_id, badge_type)` work:
  CONSTRAINT badges_unique_per_student_type UNIQUE (student_id, badge_type)
);

CREATE INDEX badges_school_idx ON public.badges (school_id);
CREATE INDEX badges_type_idx   ON public.badges (badge_type);


-- ============================================================================
-- 2. FUNCTIONS  (all SECURITY DEFINER; all callable by anon+authenticated
--               via /rest/v1/rpc/<name> — see docs/09-security-and-risks.md)
-- ============================================================================

-- Called from src/pages/StudentAssignmentSubmit.jsx after every insert,
-- from the whisper-failsafe edge function after each transcript write,
-- and from src/lib/games/wfComplete.js after every completed/timeout
-- Word Family session.
-- Takes a student id directly (not a submission id) — school_id is read
-- straight off profiles, since a game session has no submission row to
-- join through. total_score now also includes this period's game_score
-- points alongside teacher_score/words/unique_words.
-- Period boundaries are computed from now(), NOT from the triggering
-- event's own timestamp — see docs/08-scoring-and-leaderboard.md for
-- the resulting period-boundary bug (pre-existing, unchanged by this).
CREATE OR REPLACE FUNCTION public.recalculate_student_scores(p_student_id uuid)
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
  SELECT p.school_id
  INTO v_school_id
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
  FROM unnest(string_to_array(lower(regexp_replace(COALESCE(v_all_transcripts,''), '[^a-zA-Z\s]', '', 'g')), ' ')) AS word
  WHERE word <> '';

  SELECT COALESCE(SUM(gs.points), 0) INTO v_game_points_total
  FROM public.game_score gs
  WHERE gs.student_id = v_student_id
    AND gs.played_at >= v_week_start
    AND gs.played_at <  v_week_start + interval '7 days';

  v_total_score := v_teacher_score_total + (v_total_words * 1) + (v_unique_words * 3) + v_game_points_total;

  INSERT INTO public.scores (student_id, school_id, period_type, period_start,
                             teacher_score_total, total_words, unique_words, total_score, updated_at)
  VALUES (v_student_id, v_school_id, 'weekly', v_week_start,
          v_teacher_score_total, v_total_words, v_unique_words, v_total_score, now())
  ON CONFLICT (student_id, school_id, period_type, period_start)
  DO UPDATE SET teacher_score_total = EXCLUDED.teacher_score_total,
                total_words         = EXCLUDED.total_words,
                unique_words        = EXCLUDED.unique_words,
                total_score         = EXCLUDED.total_score,
                updated_at          = now();

  -- MONTHLY (same shape)
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
  FROM unnest(string_to_array(lower(regexp_replace(COALESCE(v_all_transcripts,''), '[^a-zA-Z\s]', '', 'g')), ' ')) AS word
  WHERE word <> '';

  SELECT COALESCE(SUM(gs.points), 0) INTO v_game_points_total
  FROM public.game_score gs
  WHERE gs.student_id = v_student_id
    AND gs.played_at >= v_month_start
    AND gs.played_at <  v_month_start + interval '1 month';

  v_total_score := v_teacher_score_total + (v_total_words * 1) + (v_unique_words * 3) + v_game_points_total;

  INSERT INTO public.scores (student_id, school_id, period_type, period_start,
                             teacher_score_total, total_words, unique_words, total_score, updated_at)
  VALUES (v_student_id, v_school_id, 'monthly', v_month_start,
          v_teacher_score_total, v_total_words, v_unique_words, v_total_score, now())
  ON CONFLICT (student_id, school_id, period_type, period_start)
  DO UPDATE SET teacher_score_total = EXCLUDED.teacher_score_total,
                total_words         = EXCLUDED.total_words,
                unique_words        = EXCLUDED.unique_words,
                total_score         = EXCLUDED.total_score,
                updated_at          = now();

  PERFORM public.update_all_leaderboard_ranks(v_school_id, v_week_start, v_month_start);
END;
$function$;


-- Recomputes DENSE_RANK() for both weekly and monthly leaderboards of one school,
-- called at the tail of every recalculate_student_scores invocation.
CREATE OR REPLACE FUNCTION public.update_all_leaderboard_ranks(
  p_school_id uuid, p_week_start date, p_month_start date
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.leaderboard_weekly (student_id, school_id, period_start, total_score, rank)
  SELECT student_id, school_id, period_start, total_score,
         dense_rank() OVER (PARTITION BY school_id, period_start ORDER BY total_score DESC)
  FROM public.scores
  WHERE school_id = p_school_id AND period_type = 'weekly' AND period_start = p_week_start
  ON CONFLICT (student_id, school_id, period_start)
  DO UPDATE SET total_score = EXCLUDED.total_score, rank = EXCLUDED.rank;

  INSERT INTO public.leaderboard_monthly (student_id, school_id, period_start, total_score, rank)
  SELECT student_id, school_id, period_start, total_score,
         dense_rank() OVER (PARTITION BY school_id, period_start ORDER BY total_score DESC)
  FROM public.scores
  WHERE school_id = p_school_id AND period_type = 'monthly' AND period_start = p_month_start
  ON CONFLICT (student_id, school_id, period_start)
  DO UPDATE SET total_score = EXCLUDED.total_score, rank = EXCLUDED.rank;
END;
$function$;


-- Called nightly by pg_cron job `nightly-leaderboard-seal` (`5 0 * * *` UTC).
-- Awards top-5 badges for the period that just ended, UTC-based.
CREATE OR REPLACE FUNCTION public.run_leaderboard_seal()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_last_monday      date := (date_trunc('week',  now()) - interval '7 days')::date;
    v_last_month_start date := (date_trunc('month', now()) - interval '1 month')::date;
    r record;
BEGIN
    IF extract(dow from now()) = 1 THEN
        FOR r IN
            SELECT student_id, school_id, period_start
            FROM public.leaderboard_weekly
            WHERE period_start = v_last_monday AND rank <= 5
        LOOP
            PERFORM public.award_badge_idempotent(r.student_id, r.school_id, 'weekly_top5', r.period_start);
        END LOOP;
    END IF;

    IF extract(day from now()) = 1 THEN
        FOR r IN
            SELECT student_id, school_id, period_start
            FROM public.leaderboard_monthly
            WHERE period_start = v_last_month_start AND rank <= 5
        LOOP
            PERFORM public.award_badge_idempotent(r.student_id, r.school_id, 'monthly_top5', r.period_start);
        END LOOP;
    END IF;
END;
$function$;


-- BUG: p_period_start is accepted but not used. Idempotency is a blunt
-- 24h cooldown instead of a per-period check — see docs/02-database-functions.md.
CREATE OR REPLACE FUNCTION public.award_badge_idempotent(
  p_student_id uuid, p_school_id uuid, p_badge_type text, p_period_start date
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.badges (student_id, school_id, badge_type, count, last_earned_at)
  VALUES (p_student_id, p_school_id, p_badge_type, 1, now())
  ON CONFLICT (student_id, badge_type)
  DO UPDATE SET
    count          = badges.count + 1,
    last_earned_at = now()
  WHERE badges.last_earned_at < now() - interval '1 day' OR badges.last_earned_at IS NULL;
END;
$function$;


-- SECURITY: Anon-callable via /rest/v1/rpc/admin_reset_password with no
-- internal auth check. Called from src/pages/StudentForgotPassword.jsx.
-- See docs/09-security-and-risks.md item #1.
CREATE OR REPLACE FUNCTION public.admin_reset_password(target_user_id uuid, new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$function$;


-- Trigger function: auto-confirms email for synthetic student accounts.
CREATE OR REPLACE FUNCTION public.auto_confirm_students()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.email LIKE '%@students.eduvoice.app' THEN
    NEW.email_confirmed_at = now();
  END IF;
  RETURN NEW;
END;
$function$;


-- ============================================================================
-- 3. TRIGGERS  (application-relevant only; storage.*/realtime.* omitted)
-- ============================================================================

CREATE TRIGGER confirm_student_on_signup
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_students();


-- ============================================================================
-- 4. STORAGE BUCKETS  (both are PUBLIC; contra docs-archive/supabase-storage-stale.sql)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('assignment-briefs', 'assignment-briefs', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 5. pg_cron JOBS  (from cron.job — extension pg_cron 1.6.4)
-- ============================================================================
--
-- jobid 4  "nightly-leaderboard-seal"  schedule: 5 0 * * *      (00:05 UTC daily)
--   command: SELECT public.run_leaderboard_seal();
--   Purpose: seal weekly (Monday) / monthly (1st) top-5 badges after the period ends.
--
-- jobid 8  "audio-failsafe-check"      schedule: */30 * * * *   (every 30 min)
--   command: SELECT net.http_post(
--     url := 'https://xlqnueqyqesfqwkbpwud.supabase.co/functions/v1/whisper-failsafe',
--     headers := '{ "Content-Type": "application/json",
--                   "Authorization": "Bearer <SERVICE_ROLE_JWT>" }'::jsonb,
--     timeout_milliseconds := 60000
--   );
--   Purpose: invoke the whisper-failsafe edge function to transcribe stuck audio.
--
-- Both jobs are `active=true` and confirmed succeeding on every recent run
-- (checked via cron.job_run_details 2026-07-24).
--
-- NOTE: The `Authorization` header in job 8 embeds a service-role JWT for this
-- project. It is stored in cron.job.command as plaintext and readable by any
-- Postgres role with SELECT on cron.job (typically postgres/service_role).
-- Rotating the service-role key requires updating this job's command too.
--
-- ============================================================================


-- ============================================================================
-- 6. EXTENSIONS INSTALLED  (from pg_extension where installed_version IS NOT NULL)
-- ============================================================================
--   pg_catalog.plpgsql          1.0
--   extensions.pgcrypto         1.3   -- crypt()/gen_salt() used by admin_reset_password
--   extensions.uuid-ossp        1.1
--   extensions.pg_stat_statements 1.11
--   vault.supabase_vault        0.3.1
--   pg_catalog.pg_cron          1.6.4 -- job scheduler (see section 5)
--   public.pg_net               0.20.0 -- HTTP client used by cron job 8;
--                                        Supabase advisor flags it for living
--                                        in public schema (see docs/09-security-and-risks.md #7)
