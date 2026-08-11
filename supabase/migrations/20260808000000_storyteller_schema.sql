-- 20260808000000_storyteller_schema.sql
-- Story Teller (Phase 1): reading + sentence highlighting only.
-- Assessment (summary + Q&A) tables come in Phase 2.
-- See docs/games/09-story-weaver.md and plan file for full design.
--
-- Prerequisite: run `npm run seed:reference` after applying this migration so
-- the story_teller row is upserted into public.games (games.json updated).

-- 1. storyteller_sessions — one row per paragraph of a story.
--    (level_id, step) identifies a story; session_order the paragraph within.
--    Story-level fields (story_name, key_beats, max_summary_duration_seconds)
--    are duplicated across paragraphs of the same story, matching the
--    sentence_builder_sessions convention (story_name is on every row).
CREATE TABLE public.storyteller_sessions (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                       uuid NOT NULL REFERENCES public.games(id),
  level_id                      uuid NOT NULL REFERENCES public.levels(id),
  step                          int  NOT NULL CHECK (step BETWEEN 1 AND 10),
  session_order                 int  NOT NULL,
  story_name                    text NOT NULL,
  sentences_en                  jsonb NOT NULL,   -- [{text, start_ms, end_ms}, ...]
  sentences_hi_mix              jsonb NOT NULL,   -- same shape, Hinglish
  audio_en_url                  text NOT NULL,    -- path in game-assets bucket
  audio_hi_mix_url              text NOT NULL,
  key_beats                     jsonb,            -- [{id, text}, ...] — Phase 2 uses
  max_summary_duration_seconds  int,              -- Phase 2 uses; default 180
  is_active                     boolean NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level_id, step, session_order)
);
CREATE INDEX storyteller_sessions_lookup_idx
  ON public.storyteller_sessions (game_id, level_id, step, session_order, is_active);

CREATE TRIGGER storyteller_sessions_set_updated_at
  BEFORE UPDATE ON public.storyteller_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. storyteller_attempts — one row per decision-button click at end of paragraph.
--    attempt_status matches the WF/SB convention. choice_made is the specific
--    button when completed; null when aborted (tab closed mid-paragraph).
CREATE TABLE public.storyteller_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL REFERENCES public.storyteller_sessions(id),
  choice_made     text CHECK (choice_made IN ('understood', 'need_help', 'read_again')),
  attempt_status  text NOT NULL CHECK (attempt_status IN ('completed', 'aborted')),
  duration_ms     int  NOT NULL,
  played_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (attempt_status = 'completed' AND choice_made IS NOT NULL)
    OR (attempt_status = 'aborted')
  )
);
CREATE INDEX storyteller_attempts_student_played_idx
  ON public.storyteller_attempts (student_id, played_at DESC);
CREATE INDEX storyteller_attempts_session_played_idx
  ON public.storyteller_attempts (session_id, played_at DESC);

-- 3. storyteller_errors — audio load failures and similar client-side issues,
--    so we can spot systemic problems (bad file, dead CDN, etc.) later.
CREATE TABLE public.storyteller_errors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id   uuid REFERENCES public.storyteller_sessions(id),
  error_code   text NOT NULL,          -- 'audio_load_failed', 'timeupdate_stall', etc.
  detail       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX storyteller_errors_recent_idx
  ON public.storyteller_errors (created_at DESC);

-- 4. RLS policies — mirror WF/SB conventions.
ALTER TABLE public.storyteller_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyteller_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyteller_errors   ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read active session content.
CREATE POLICY storyteller_sessions_read ON public.storyteller_sessions
  FOR SELECT TO authenticated USING (is_active = true);

-- Students may insert and select only their own attempts.
CREATE POLICY storyteller_attempts_insert_own ON public.storyteller_attempts
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY storyteller_attempts_select_own ON public.storyteller_attempts
  FOR SELECT TO authenticated USING (student_id = auth.uid());

-- Students may report their own errors (student_id null for anonymous/pre-auth issues).
CREATE POLICY storyteller_errors_insert ON public.storyteller_errors
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() OR student_id IS NULL);
