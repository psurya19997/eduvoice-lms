-- 20260726000000_games_mvp1_schema.sql
-- Games MVP-1: 7 shared tables + 2 Word Family tables.
-- See docs/games/04-data-model.md and docs/games/05-word-family.md.

-- Shared trigger fn for updated_at columns
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. skills
CREATE TABLE public.skills (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,
  display_name text NOT NULL,
  sort_order   int  NOT NULL,
  is_active    boolean NOT NULL DEFAULT true
);

-- 2. levels
CREATE TABLE public.levels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,
  display_name text NOT NULL,
  cefr_level   text NOT NULL,
  ordinal      int  NOT NULL,
  is_active    boolean NOT NULL DEFAULT true
);

-- 3. games
CREATE TABLE public.games (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,
  display_name text NOT NULL,
  icon         text,
  sort_order   int  NOT NULL,
  is_active    boolean NOT NULL DEFAULT false
);

-- 4. game_skill_weights (pedagogy encoded as data; weights per (game, level) sum to 1.00 — enforced at seed time)
CREATE TABLE public.game_skill_weights (
  game_id  uuid NOT NULL REFERENCES public.games(id)  ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES public.levels(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  weight   numeric(3,2) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  PRIMARY KEY (game_id, level_id, skill_id)
);

-- 5. game_score (shared session outcome; attempt_id is loose FK, interpret via game_id)
CREATE TABLE public.game_score (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_id    uuid NOT NULL REFERENCES public.games(id),
  attempt_id uuid NOT NULL,
  score      int  NOT NULL CHECK (score BETWEEN 0 AND 100),
  points     int  NOT NULL CHECK (points IN (3, 5)),
  played_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_score_student_played_idx ON public.game_score (student_id, played_at DESC);
CREATE INDEX game_score_game_played_idx    ON public.game_score (game_id, played_at DESC);

-- 6. student_skill_mastery (rolling per-student state)
CREATE TABLE public.student_skill_mastery (
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id      uuid NOT NULL REFERENCES public.skills(id),
  mastery_pct   int  NOT NULL DEFAULT 0 CHECK (mastery_pct BETWEEN 0 AND 100),
  correct_count int  NOT NULL DEFAULT 0,
  attempt_count int  NOT NULL DEFAULT 0,
  last_updated  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, skill_id)
);

-- 7. student_skill_mastery_history (audit trail)
CREATE TABLE public.student_skill_mastery_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id     uuid NOT NULL REFERENCES public.skills(id),
  old_value    int  NOT NULL,
  new_value    int  NOT NULL,
  delta        int  NOT NULL,
  attempt_id   uuid NOT NULL,
  game_id      uuid NOT NULL REFERENCES public.games(id),
  triggered_by text NOT NULL CHECK (triggered_by IN ('correct_pick','session_completion','admin_reset')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ssm_history_student_created_idx ON public.student_skill_mastery_history (student_id, created_at DESC);
CREATE INDEX ssm_history_attempt_idx         ON public.student_skill_mastery_history (attempt_id);

-- 8. word_family_sessions (Word Family session content)
CREATE TABLE public.word_family_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id              uuid NOT NULL REFERENCES public.games(id),
  level_id             uuid NOT NULL REFERENCES public.levels(id),
  step                 int  NOT NULL CHECK (step BETWEEN 1 AND 10),
  category_name        text NOT NULL,
  number_of_words      int  NOT NULL CHECK (number_of_words > 0),
  words                jsonb NOT NULL,
  hint                 text,
  time_limit_seconds   int,
  show_category_prompt boolean NOT NULL DEFAULT true,
  show_image           boolean NOT NULL DEFAULT true,
  l1_support           text NOT NULL DEFAULT 'on_tap' CHECK (l1_support IN ('on_tap','wrong_only','off')),
  require_production   boolean NOT NULL DEFAULT false,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX word_family_sessions_lookup_idx ON public.word_family_sessions (game_id, level_id, step, is_active);

CREATE TRIGGER word_family_sessions_set_updated_at
  BEFORE UPDATE ON public.word_family_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. word_family_attempts (Word Family per-play event log; row written for every play including aborted)
CREATE TABLE public.word_family_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id          uuid NOT NULL REFERENCES public.word_family_sessions(id),
  picks               text[] NOT NULL DEFAULT '{}',
  correct_picks_count int  NOT NULL DEFAULT 0,
  wrong_picks_count   int  NOT NULL DEFAULT 0,
  total_targets       int  NOT NULL,
  is_correct          boolean NOT NULL DEFAULT false,
  attempt_status      text NOT NULL CHECK (attempt_status IN ('completed','timeout','aborted')),
  duration_ms         int  NOT NULL,
  played_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX word_family_attempts_student_played_idx ON public.word_family_attempts (student_id, played_at DESC);
CREATE INDEX word_family_attempts_session_played_idx ON public.word_family_attempts (session_id, played_at DESC);
