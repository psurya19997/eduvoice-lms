-- 20260731000002_sb_seed_reference.sql

-- Flip sentence_builder game to active
UPDATE public.games SET is_active = true WHERE key = 'sentence_builder';

-- Skill weights for SB x Alpha
INSERT INTO public.game_skill_weights (game_id, level_id, skill_id, weight)
SELECT g.id, l.id, s.id, w.weight
FROM public.games g
CROSS JOIN public.levels l
JOIN (VALUES
  ('grammar',    0.60),
  ('writing',    0.25),
  ('vocabulary', 0.15)
) AS w(skill_key, weight) ON true
JOIN public.skills s ON s.key = w.skill_key
WHERE g.key = 'sentence_builder' AND l.key = 'alpha';

-- Beta and Gamma
INSERT INTO public.game_skill_weights (game_id, level_id, skill_id, weight)
SELECT g.id, l.id, s.id, w.weight
FROM public.games g
CROSS JOIN public.levels l
JOIN (VALUES
  ('grammar',    0.60),
  ('writing',    0.25),
  ('vocabulary', 0.15)
) AS w(skill_key, weight) ON true
JOIN public.skills s ON s.key = w.skill_key
WHERE g.key = 'sentence_builder' AND l.key IN ('beta', 'gamma');

-- Seed the 4 characters
INSERT INTO public.game_characters (key, display_name, portrait_url, bio_en, bio_hi) VALUES
  ('raju',  'Raju',  'characters/raju_portrait.jpg',  'A cheerful boy from a village near Nashik.',   'नाशिक के पास के गांव का एक हँसमुख लड़का।'),
  ('meera', 'Meera', 'characters/meera_portrait.jpg', 'A curious girl who loves the mela.',           'मेले से प्यार करने वाली एक जिज्ञासु लड़की।'),
  ('chotu', 'Chotu', 'characters/chotu_portrait.jpg', 'The friendly farm cow.',                       'खेत की मिलनसार गाय।'),
  ('bibi',  'Bibi',  'characters/bibi_portrait.jpg',  'The wise grandmother of the household.',       'घर की समझदार दादी।');
