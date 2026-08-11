-- 20260731000006_sb_demo_sessions_step2.sql

WITH
  sb_game AS (SELECT id FROM public.games WHERE key = 'sentence_builder' LIMIT 1),
  lvl_alpha AS (SELECT id FROM public.levels WHERE key = 'alpha' LIMIT 1)
INSERT INTO public.sentence_builder_sessions (
  game_id, level_id, step, session_order, mechanic, story_name,
  image_url, context_setting, speaker_character, anchor_text,
  hint_1, hint_2, time_limit_seconds, session_intro,
  layout, valid_sentences, tiles
)
SELECT
  g.id, l.id,
  v.step, v.session_order, v.mechanic, v.story_name,
  v.image_url, v.context_setting, v.speaker_character, v.anchor_text,
  v.hint_1, v.hint_2, v.time_limit_seconds, v.session_intro,
  v.layout::jsonb, v.valid_sentences::jsonb, v.tiles::jsonb
FROM sb_game g
CROSS JOIN lvl_alpha l
JOIN (VALUES
  (
    2, 1, 'narrate', 'The Hungry Puppy',
    'sb_alpha_2/1_2_alpha_sb_puppy_sleep.jpg', 'The puppy has not eaten for two days. First, you must wake him up!', NULL, NULL,
    'What are you doing to the puppy?', 'यहाँ आप काम कर रहे हैं, इसलिए ''He'' की जगह ''I'' (मैं) चुनें।', 180,
    'Tap the word chips to complete your mission!',
    '[{"type":"slot"}, {"type":"locked", "word":"wake"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["I", "wake", "the", "sleepy", "puppy", "."]]',
    '{"targets": ["I", "the", "sleepy", "puppy"], "distractors": ["sleep", "He"]}'
  ),
  (
    2, 2, 'narrate', 'The Hungry Puppy',
    'sb_alpha_2/2_2_alpha_sb_pup_por.jpg', 'The bowl is empty. Give him some food.', NULL, NULL,
    'What are you putting into the bowl?', 'हम कटोरी में खाना डाल रहे हैं, पानी (water) नहीं।', 180,
    NULL,
    '[{"type":"slot"}, {"type":"locked", "word":"pour"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["I", "pour", "food", "in", "the", "bowl", "."]]',
    '{"targets": ["I", "food", "in", "the", "bowl"], "distractors": ["water", "plate"]}'
  ),
  (
    2, 3, 'narrate', 'The Hungry Puppy',
    'sb_alpha_2/3_2_alpha_sb_pup_bng.jpg', 'Oh no! He ran out the door. Bring him back inside.', NULL, NULL,
    'What are you doing with the puppy?', 'पिल्ला बाहर भागा था, लेकिन अब आप उसे वापस (back) ला रहे हैं।', 180,
    NULL,
    '[{"type":"slot"}, {"type":"locked", "word":"bring"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["I", "bring", "the", "puppy", "back", "."]]',
    '{"targets": ["I", "the", "puppy", "back"], "distractors": ["run", "away"]}'
  ),
  (
    2, 4, 'narrate', 'The Hungry Puppy',
    'sb_alpha_2/4_2_alpha_sb_pup_pet.jpg', 'He is scared. Calm him down.', NULL, NULL,
    'How do you comfort a dog?', 'पिल्ला बहुत नर्म (soft) है, तेज़ (loud) नहीं।', 180,
    NULL,
    '[{"type":"slot"}, {"type":"locked", "word":"pet"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["I", "pet", "the", "soft", "puppy", "."]]',
    '{"targets": ["I", "the", "soft", "puppy"], "distractors": ["hit", "loud"]}'
  ),
  (
    2, 5, 'narrate', 'The Hungry Puppy',
    'sb_alpha_2/5_2_alpha_sb_pup_eat.jpg', 'He is happy! Now you can both eat.', NULL, NULL,
    'What are you and the puppy doing at the same time?', 'आप दोनों साथ में (together) खा रहे हैं, अकेले (alone) नहीं।', 180,
    NULL,
    '[{"type":"slot"}, {"type":"locked", "word":"eat"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["We", "eat", "our", "food", "together", "."]]',
    '{"targets": ["We", "our", "food", "together"], "distractors": ["They", "alone"]}'
  )
) AS v(
  step, session_order, mechanic, story_name,
  image_url, context_setting, speaker_character, anchor_text,
  hint_1, hint_2, time_limit_seconds, session_intro,
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
  session_intro = EXCLUDED.session_intro,
  layout = EXCLUDED.layout,
  valid_sentences = EXCLUDED.valid_sentences,
  tiles = EXCLUDED.tiles;
