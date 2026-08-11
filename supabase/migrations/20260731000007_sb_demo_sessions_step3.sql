-- 20260731000007_sb_demo_sessions_step3.sql

WITH
  sb_game AS (SELECT id FROM public.games WHERE key = 'sentence_builder' LIMIT 1),
  lvl_alpha AS (SELECT id FROM public.levels WHERE key = 'alpha' LIMIT 1)
INSERT INTO public.sentence_builder_sessions (
  game_id, level_id, step, session_order, mechanic, story_name,
  image_url, context_setting, speaker_character, anchor_text,
  hint_1, hint_2, time_limit_seconds, flash_duration_ms, session_intro,
  layout, valid_sentences, tiles
)
SELECT
  g.id, l.id,
  v.step, v.session_order, v.mechanic, v.story_name,
  v.image_url, v.context_setting, v.speaker_character, v.anchor_text,
  v.hint_1, v.hint_2, v.time_limit_seconds, v.flash_duration_ms, v.session_intro,
  v.layout::jsonb, v.valid_sentences::jsonb, v.tiles::jsonb
FROM sb_game g
CROSS JOIN lvl_alpha l
JOIN (VALUES
  (
    3, 1, 'flash', 'The Mystery Egg',
    'sb_alpha_3/1_3_alpha_sb_egg_finds.jpg', 'Look closely! The words will flash and disappear.', NULL, NULL,
    'Remember, it was a boy named Raju.', 'राजू (Raju) को एक (a) अंडा मिला।', 180, 3000,
    'Get ready to memorize!',
    '[{"type":"slot"}, {"type":"locked", "word":"finds"}, {"type":"slot"}, {"type":"locked", "word":"giant"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["Raju", "finds", "a", "giant", "egg", "."]]',
    '{"targets": ["Raju", "a", "egg"], "distractors": ["He", "the", "ball"]}'
  ),
  (
    3, 2, 'flash', 'The Mystery Egg',
    'sb_alpha_3/2_3_alpha_sb_egg_cold.jpg', 'What does it feel like?', NULL, NULL,
    'Think about the color of the shell and how it feels.', 'खोल नीला (blue) है और यह ठंडा (cold) लगता है।', 180, 3000,
    NULL,
    '[{"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"shell"}, {"type":"locked", "word":"feels"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["The", "blue", "shell", "feels", "cold", "."]]',
    '{"targets": ["The", "blue", "cold"], "distractors": ["A", "red", "hot"]}'
  ),
  (
    3, 3, 'flash', 'The Mystery Egg',
    'sb_alpha_3/3_3_alpha_sb_egg_shake.jpg', 'Wait, something is happening!', NULL, NULL,
    'What kind of noises is it making?', 'अंडा तेज़ (loud) आवाज़ कर रहा है।', 180, 3000,
    NULL,
    '[{"type":"locked", "word":"Suddenly"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"noises"}, {"type":"punct", "word":"."}]',
    '[["Suddenly", "it", "makes", "loud", "noises", "."]]',
    '{"targets": ["it", "makes", "loud"], "distractors": ["he", "make", "quiet"]}'
  ),
  (
    3, 4, 'flash', 'The Mystery Egg',
    'sb_alpha_3/4_3_alpha_sb_egg_tail.jpg', 'What is coming out?', NULL, NULL,
    'Look at the length and color of the tail.', 'पूंछ लंबी (long) और हरी (green) है।', 180, 3000,
    NULL,
    '[{"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"tail"}, {"type":"locked", "word":"appears"}, {"type":"punct", "word":"."}]',
    '[["A", "long", "green", "tail", "appears", "."]]',
    '{"targets": ["A", "long", "green"], "distractors": ["The", "short", "red"]}'
  ),
  (
    3, 5, 'flash', 'The Mystery Egg',
    'sb_alpha_3/5_3_alpha_sb_egg_monster.jpg', 'Oh no! Is it dangerous?', NULL, NULL,
    'Is it a monster?', 'क्या यह (it) एक (a) राक्षस है?', 180, 3000,
    NULL,
    '[{"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"scary"}, {"type":"locked", "word":"monster"}, {"type":"punct", "word":"?"}]',
    '[["Is", "it", "a", "scary", "monster", "?"]]',
    '{"targets": ["Is", "it", "a"], "distractors": ["Are", "he", "the"]}'
  ),
  (
    3, 6, 'flash', 'The Mystery Egg',
    'sb_alpha_3/6_3_alpha_sb_egg_cute.jpg', 'Phew! Look how cute.', NULL, NULL,
    'It is not scary, it is a dragon!', 'यह (it) एक (a) ड्रैगन है।', 180, 3000,
    NULL,
    '[{"type":"locked", "word":"No,"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"cute"}, {"type":"locked", "word":"dragon"}, {"type":"punct", "word":"!"}]',
    '[["No,", "it", "is", "a", "cute", "dragon", "!"]]',
    '{"targets": ["it", "is", "a"], "distractors": ["he", "are", "an"]}'
  ),
  (
    3, 7, 'flash', 'The Mystery Egg',
    'sb_alpha_3/7_3_alpha_sb_egg_fire.jpg', 'Wait... did he just sneeze?', NULL, NULL,
    'What comes out when a dragon sneezes?', 'ड्रैगन गर्म (hot) आग (fire) छींकता है।', 180, 3000,
    NULL,
    '[{"type":"slot"}, {"type":"locked", "word":"dragon"}, {"type":"locked", "word":"sneezes"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"!"}]',
    '[["The", "dragon", "sneezes", "hot", "fire", "!"]]',
    '{"targets": ["The", "hot", "fire"], "distractors": ["A", "cold", "water"]}'
  )
) AS v(
  step, session_order, mechanic, story_name,
  image_url, context_setting, speaker_character, anchor_text,
  hint_1, hint_2, time_limit_seconds, flash_duration_ms, session_intro,
  layout, valid_sentences, tiles
) ON true
ON CONFLICT (level_id, step, session_order) DO UPDATE SET
  mechanic = EXCLUDED.mechanic,
  story_name = EXCLUDED.story_name,
  image_url = EXCLUDED.image_url,
  context_setting = EXCLUDED.context_setting,
  speaker_character = EXCLUDED.speaker_character,
  anchor_text = EXCLUDED.anchor_text,
  hint_1 = EXCLUDED.hint_1,
  hint_2 = EXCLUDED.hint_2,
  time_limit_seconds = EXCLUDED.time_limit_seconds,
  flash_duration_ms = EXCLUDED.flash_duration_ms,
  session_intro = EXCLUDED.session_intro,
  layout = EXCLUDED.layout,
  valid_sentences = EXCLUDED.valid_sentences,
  tiles = EXCLUDED.tiles;
