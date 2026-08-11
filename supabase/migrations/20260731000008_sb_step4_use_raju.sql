-- 20260731000008_sb_step4_use_raju.sql
-- Chotu (the cow portrait) is out of place for grammar-mistake sessions
-- authored around a schoolboy voice. Switch Step 4's speaker to Raju.

UPDATE public.sentence_builder_sessions AS s
SET speaker_character = 'raju'
FROM public.games g, public.levels l
WHERE s.game_id = g.id
  AND s.level_id = l.id
  AND g.key = 'sentence_builder'
  AND l.key = 'alpha'
  AND s.step = 4;
