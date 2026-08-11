-- 20260810000002_storyteller_trigger_search_path.sql
-- Pin search_path on the two Story Teller trigger functions (Supabase security lint 0011).

CREATE OR REPLACE FUNCTION public.st_practice_bubble_score()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
      NEW.student_id, v_game_id, NEW.id, NEW.final_score,
      CASE WHEN NEW.final_score >= 50 THEN 5 ELSE 3 END,
      NEW.played_at
    );
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.st_bonus_bubble_score()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.analysis_status = 'analyzed'
     AND (OLD.analysis_status IS DISTINCT FROM 'analyzed')
     AND NEW.final_score IS NOT NULL THEN
    INSERT INTO public.game_score (student_id, game_id, attempt_id, score, points, played_at)
    VALUES (
      NEW.student_id, NEW.game_id, NEW.id, NEW.final_score,
      CASE WHEN NEW.final_score >= 50 THEN 5 ELSE 3 END,
      NEW.ended_at
    );
  END IF;
  RETURN NEW;
END $$;
