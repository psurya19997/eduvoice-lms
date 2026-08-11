-- 20260810000000_storyteller_phase2_schema.sql
-- Story Teller Phase 2: practice items + attempts + bonus Q&A tables.
-- See docs/games/08-story-teller-phase2-implementation.md for the full design.
--
-- What this migration does:
--   1. ALTERs storyteller_sessions: drop unused Phase 1 columns; add bonus_qna_cap_seconds.
--   2. Creates storyteller_practice_items (author content — question/task/roleplay).
--   3. Creates storyteller_practice_attempts (child submissions + async Gemini analysis).
--   4. Creates storyteller_bonus_attempts (Gemini Live conversations + post-session analysis).
--   5. Creates trigger functions to bubble final_score into shared game_score table.
--   6. Sets RLS: read-active for items; own-only for attempts.
--   7. Creates private storage bucket storyteller-audio-private for child recordings.

-- ---------------------------------------------------------------------------
-- 1. ALTER storyteller_sessions
-- ---------------------------------------------------------------------------

-- Drop columns that were Phase 1 placeholders; content now lives per-item.
ALTER TABLE public.storyteller_sessions
  DROP COLUMN IF EXISTS key_beats,
  DROP COLUMN IF EXISTS max_summary_duration_seconds;

-- Add story-level cap for bonus Q&A (denormalized across all paragraph rows of the same story,
-- matching the sentence_builder story_name pattern). Default 180s = 3 min.
ALTER TABLE public.storyteller_sessions
  ADD COLUMN bonus_qna_cap_seconds int NOT NULL DEFAULT 180;

-- ---------------------------------------------------------------------------
-- 2. storyteller_practice_items — author content per (story, session|story-end, mode)
-- ---------------------------------------------------------------------------

CREATE TABLE public.storyteller_practice_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               uuid NOT NULL REFERENCES public.games(id),
  level_id              uuid NOT NULL REFERENCES public.levels(id),
  step                  int  NOT NULL CHECK (step BETWEEN 1 AND 10),
  session_id            uuid REFERENCES public.storyteller_sessions(id),
                        -- NOT NULL → item shows after this paragraph
                        -- NULL     → item shows at story-end
  mode                  text NOT NULL CHECK (mode IN ('question','task','roleplay')),
  item_order            int  NOT NULL,
  content               jsonb NOT NULL,        -- { prompt, beats:[{id,text}], scene_setup?, child_role? }
  duration_cap_seconds  int  NOT NULL DEFAULT 60,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness within a "slot" (partial indexes because NULL != NULL in composite uniqueness).
CREATE UNIQUE INDEX practice_items_inline_unique
  ON public.storyteller_practice_items (session_id, mode, item_order)
  WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX practice_items_storyend_unique
  ON public.storyteller_practice_items (level_id, step, mode, item_order)
  WHERE session_id IS NULL;

CREATE INDEX practice_items_lookup_idx
  ON public.storyteller_practice_items (level_id, step, session_id, is_active);

CREATE TRIGGER practice_items_set_updated_at
  BEFORE UPDATE ON public.storyteller_practice_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. storyteller_practice_attempts — one row per audio submission
-- ---------------------------------------------------------------------------

CREATE TABLE public.storyteller_practice_attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  practice_item_id      uuid NOT NULL REFERENCES public.storyteller_practice_items(id),
  input_mode            text NOT NULL CHECK (input_mode IN ('spoken','typed')),
  attempt_status        text NOT NULL CHECK (attempt_status IN (
                          'upload_pending','submitted_pending','completed',
                          'failed','aborted','no_speech','timeout'
                        )),

  -- Child submission
  audio_url             text,                  -- path in private bucket; null if typed
  audio_duration_ms     int,
  duration_ms           int NOT NULL,          -- prompt-shown → submit; always populated

  -- Gemini analysis (NULLABLE until analysis completes)
  transcript            text,
  word_count_total      int,
  unique_english        int,
  unique_hindi          int,
  relevance_band        int CHECK (relevance_band BETWEEN 0 AND 3),
  coverage_band         int CHECK (coverage_band  BETWEEN 0 AND 3),
  beats_covered         jsonb,                 -- ["b1","b3"]
  positive_note         text,
  next_step             text,
  gemini_error          text,
  gemini_attempts       int NOT NULL DEFAULT 0, -- 3 inline + up to 5 backend

  final_score           int CHECK (final_score BETWEEN 0 AND 100),

  submitted_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_at           timestamptz,           -- when Gemini analysis completed
  played_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX practice_attempts_student_played_idx
  ON public.storyteller_practice_attempts (student_id, played_at DESC);
CREATE INDEX practice_attempts_item_idx
  ON public.storyteller_practice_attempts (practice_item_id, played_at DESC);

-- Cheap lookup for the retry worker.
CREATE INDEX practice_attempts_pending_idx
  ON public.storyteller_practice_attempts (submitted_at)
  WHERE attempt_status IN ('submitted_pending','failed')
    AND gemini_attempts < 8;

-- ---------------------------------------------------------------------------
-- 4. storyteller_bonus_attempts — Gemini Live conversation rows
-- ---------------------------------------------------------------------------

CREATE TABLE public.storyteller_bonus_attempts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_id                uuid NOT NULL REFERENCES public.games(id),
  level_id               uuid NOT NULL REFERENCES public.levels(id),
  step                   int  NOT NULL CHECK (step BETWEEN 1 AND 10),
  attempt_order          int  NOT NULL,           -- 1, 2, ... per (student, story)

  -- Session mechanics
  talk_time_ms           int  NOT NULL,           -- consumed in THIS attempt; sums to per-story cap
  turns                  jsonb NOT NULL,          -- [{ role, text, audio_url, audio_duration_ms, timestamp_ms }]
  ended_reason           text NOT NULL CHECK (ended_reason IN (
                           'child_ended','cap_reached','aborted','error'
                         )),
  gemini_error           text,
  started_at             timestamptz NOT NULL,
  ended_at               timestamptz NOT NULL DEFAULT now(),

  -- Post-session analysis (NULLABLE until analyzer runs)
  transcript             text,
  word_count_total       int,                      -- child only
  unique_english         int,                      -- child only
  unique_hindi           int,                      -- child only
  relevance_band         int CHECK (relevance_band BETWEEN 0 AND 3),
  positive_note          text,
  next_step              text,
  final_score            int CHECK (final_score BETWEEN 0 AND 100),

  analysis_status        text NOT NULL DEFAULT 'pending'
                          CHECK (analysis_status IN ('pending','analyzed','failed')),
  analysis_error         text,
  analysis_attempts      int NOT NULL DEFAULT 0,   -- 3 inline + 5 backend
  analyzed_at            timestamptz,

  UNIQUE (student_id, level_id, step, attempt_order)
);

CREATE INDEX bonus_attempts_student_story_idx
  ON public.storyteller_bonus_attempts (student_id, level_id, step);

CREATE INDEX bonus_attempts_pending_analysis_idx
  ON public.storyteller_bonus_attempts (ended_at)
  WHERE analysis_status IN ('pending','failed')
    AND analysis_attempts < 8;

-- ---------------------------------------------------------------------------
-- 5. Triggers — bubble final_score into shared game_score table
-- ---------------------------------------------------------------------------

-- Practice attempts: fires when attempt_status transitions to 'completed' with a final_score.
CREATE OR REPLACE FUNCTION public.st_practice_bubble_score()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_game_id uuid;
BEGIN
  IF NEW.attempt_status = 'completed'
     AND (OLD.attempt_status IS DISTINCT FROM 'completed')
     AND NEW.final_score IS NOT NULL THEN

    SELECT i.game_id INTO v_game_id
    FROM public.storyteller_practice_items i
    WHERE i.id = NEW.practice_item_id;

    INSERT INTO public.game_score (student_id, game_id, attempt_id, score, points, played_at)
    VALUES (
      NEW.student_id,
      v_game_id,
      NEW.id,
      NEW.final_score,
      CASE WHEN NEW.final_score >= 50 THEN 5 ELSE 3 END,
      NEW.played_at
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER practice_attempts_bubble_score
  AFTER UPDATE ON public.storyteller_practice_attempts
  FOR EACH ROW EXECUTE FUNCTION public.st_practice_bubble_score();

-- Bonus attempts: fires when analysis_status transitions to 'analyzed' with a final_score.
CREATE OR REPLACE FUNCTION public.st_bonus_bubble_score()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.analysis_status = 'analyzed'
     AND (OLD.analysis_status IS DISTINCT FROM 'analyzed')
     AND NEW.final_score IS NOT NULL THEN

    INSERT INTO public.game_score (student_id, game_id, attempt_id, score, points, played_at)
    VALUES (
      NEW.student_id,
      NEW.game_id,
      NEW.id,
      NEW.final_score,
      CASE WHEN NEW.final_score >= 50 THEN 5 ELSE 3 END,
      NEW.ended_at
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bonus_attempts_bubble_score
  AFTER UPDATE ON public.storyteller_bonus_attempts
  FOR EACH ROW EXECUTE FUNCTION public.st_bonus_bubble_score();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.storyteller_practice_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyteller_practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyteller_bonus_attempts    ENABLE ROW LEVEL SECURITY;

-- Any authenticated student reads active items.
CREATE POLICY practice_items_read ON public.storyteller_practice_items
  FOR SELECT TO authenticated USING (is_active = true);

-- Students insert / select / update their own practice attempts.
-- (UPDATE is needed because the retry-worker edge function uses the service-role key,
--  which bypasses RLS; the policy is here as belt-and-braces for any client-side update.)
CREATE POLICY practice_attempts_insert_own ON public.storyteller_practice_attempts
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY practice_attempts_select_own ON public.storyteller_practice_attempts
  FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY practice_attempts_update_own ON public.storyteller_practice_attempts
  FOR UPDATE TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

-- Bonus attempts: same own-only pattern.
CREATE POLICY bonus_attempts_own ON public.storyteller_bonus_attempts
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Private storage bucket for child audio
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('storyteller-audio-private', 'storyteller-audio-private', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated user may INSERT (upload) only to a path prefixed with their own uid.
-- Convention: '<auth.uid()>/<attempt_id>.webm'
CREATE POLICY "storyteller_audio_own_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'storyteller-audio-private'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Deliberately no SELECT policy: playback is via signed URLs generated by an edge function
-- using the service-role key. This keeps child audio out of any direct-fetch scenario.
