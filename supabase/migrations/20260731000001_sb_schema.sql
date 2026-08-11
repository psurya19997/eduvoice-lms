-- 20260731000001_sb_schema.sql
CREATE TABLE public.game_characters (
  key            text PRIMARY KEY,
  display_name   text NOT NULL,
  portrait_url   text NOT NULL,
  bio_en         text,
  bio_hi         text
);

CREATE TABLE public.sentence_builder_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id              uuid NOT NULL REFERENCES public.games(id),
  level_id             uuid NOT NULL REFERENCES public.levels(id),
  step                 int  NOT NULL CHECK (step BETWEEN 1 AND 10),
  session_order        int  NOT NULL,
  mechanic             text NOT NULL CHECK (mechanic IN ('narrate','flash','recast','grow')),
  story_name           text NOT NULL,
  context_setting      text,
  image_url            text,
  anchor_text          text,
  speaker_character    text REFERENCES public.game_characters(key),
  hint_1               text,
  hint_2               text,
  session_intro        text,
  time_limit_seconds   int,
  flash_duration_ms    int,
  voice_bonus_enabled  boolean NOT NULL DEFAULT false,
  voice_prompt_text    text,
  layout               jsonb NOT NULL,
  valid_sentences      jsonb NOT NULL,
  tiles                jsonb NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level_id, step, session_order)
);
CREATE INDEX sb_sessions_lookup_idx ON public.sentence_builder_sessions (level_id, step, session_order, is_active);

CREATE TRIGGER sentence_builder_sessions_set_updated_at
  BEFORE UPDATE ON public.sentence_builder_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sentence_builder_attempts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id                uuid NOT NULL REFERENCES public.sentence_builder_sessions(id),
  placed_tiles              text[] NOT NULL DEFAULT '{}',
  correct_placements_count  int  NOT NULL DEFAULT 0,
  wrong_placements_count    int  NOT NULL DEFAULT 0,
  score                     int  NOT NULL DEFAULT 0,
  is_correct                boolean NOT NULL DEFAULT false,
  attempt_status            text NOT NULL CHECK (attempt_status IN ('completed','timeout','aborted')),
  duration_ms               int  NOT NULL,
  voice_audio_url           text,
  hints_used                jsonb DEFAULT '{}'::jsonb,
  played_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sb_attempts_student_played_idx ON public.sentence_builder_attempts (student_id, played_at DESC);
CREATE INDEX sb_attempts_session_played_idx ON public.sentence_builder_attempts (session_id, played_at DESC);
