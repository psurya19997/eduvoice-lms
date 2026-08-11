-- 20260811000000_storyteller_skill_weights.sql
-- Seeds game_skill_weights for story_teller × (alpha|beta|gamma).
-- Distribution is identical across levels — see docs/games/00-current-status.md.

INSERT INTO public.game_skill_weights (game_id, level_id, skill_id, weight)
SELECT g.id, l.id, s.id, w.weight
FROM public.games  g
CROSS JOIN public.levels l
JOIN (VALUES
  ('listening',  0.40),
  ('speaking',   0.25),
  ('vocabulary', 0.20),
  ('reading',    0.15)
) AS w(skill_key, weight) ON true
JOIN public.skills s ON s.key = w.skill_key
WHERE g.key = 'story_teller' AND l.key IN ('alpha', 'beta', 'gamma')
ON CONFLICT (game_id, level_id, skill_id) DO UPDATE SET weight = EXCLUDED.weight;
