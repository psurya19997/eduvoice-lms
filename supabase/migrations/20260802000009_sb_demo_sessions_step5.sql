-- 20260802000009_sb_demo_sessions_step5.sql

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
    5::int, 1::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/1_5_alpha_sb_narrate_garden.jpg'::text,
    'An old man is sitting outside on a sunny day.'::text,
    NULL::text, NULL::text,
    'He is looking at pages outside where the plants grow.'::text,
    'बूढ़ा आदमी बगीचे (garden) में एक किताब (book) पढ़ता है।'::text,
    180::int, NULL::int,
    'A new story is starting! Tap the word chips to complete the sentences and narrate the story.'::text,
    '[{"type":"locked", "word":"The"}, {"type":"locked", "word":"old"}, {"type":"locked", "word":"man"}, {"type":"locked", "word":"reads"}, {"type":"locked", "word":"a"}, {"type":"slot"}, {"type":"locked", "word":"in"}, {"type":"locked", "word":"the"}, {"type":"slot"}, {"type":"punct", "word":"."}]'::text,
    '[["The", "old", "man", "reads", "a", "book", "in", "the", "garden", "."]]'::text,
    '{"targets": ["book", "garden"], "distractors": ["ball", "kitchen"]}'::text
  ),
  (
    5::int, 2::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/2_5_alpha_sb_narrate_theft.jpg'::text,
    'Oh no! An animal sneaks up behind him!'::text,
    NULL::text, NULL::text,
    'The bad animal is taking the things used for reading.'::text,
    'एक शरारती (naughty) बकरी (goat) उसका चश्मा (glasses) लेकर भाग जाती है।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"locked", "word":"A"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"runs"}, {"type":"locked", "word":"away"}, {"type":"locked", "word":"with"}, {"type":"locked", "word":"his"}, {"type":"slot"}, {"type":"punct", "word":"."}]'::text,
    '[["A", "naughty", "goat", "runs", "away", "with", "his", "glasses", "."]]'::text,
    '{"targets": ["naughty", "goat", "glasses"], "distractors": ["good", "cow", "shoes"]}'::text
  ),
  (
    5::int, 3::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/3_5_alpha_sb_narrate_chase.jpg'::text,
    'The old man tries to get his glasses back.'::text,
    NULL::text, NULL::text,
    'He is unable to move at a high speed.'::text,
    'बूढ़ा आदमी तेज़ (fast) नहीं दौड़ सकता।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"locked", "word":"The"}, {"type":"locked", "word":"old"}, {"type":"locked", "word":"man"}, {"type":"locked", "word":"cannot"}, {"type":"locked", "word":"run"}, {"type":"slot"}, {"type":"punct", "word":"."}]'::text,
    '[["The", "old", "man", "cannot", "run", "fast", "."]]'::text,
    '{"targets": ["fast"], "distractors": ["slow"]}'::text
  ),
  (
    5::int, 4::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/4_5_alpha_sb_narrate_boy.jpg'::text,
    'The old man is sad because he can''t read. Someone sees him.'::text,
    NULL::text, NULL::text,
    'The young child looks at the unhappy grandfather.'::text,
    'एक छोटा (little) लड़का उदास (sad) बूढ़े आदमी को देखता है।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"locked", "word":"A"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"sees"}, {"type":"locked", "word":"the"}, {"type":"slot"}, {"type":"locked", "word":"old"}, {"type":"locked", "word":"man"}, {"type":"punct", "word":"."}]'::text,
    '[["A", "little", "boy", "sees", "the", "sad", "old", "man", "."]]'::text,
    '{"targets": ["little", "boy", "sad"], "distractors": ["big", "happy"]}'::text
  ),
  (
    5::int, 5::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/5_5_alpha_sb_narrate_idea.jpg'::text,
    'The boy wants to help catch the goat without running!'::text,
    NULL::text, NULL::text,
    'The intelligent child builds a device to catch the animal.'::text,
    'समझदार (smart) लड़का एक चतुर (clever) जाल (trap) बनाता है।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"locked", "word":"The"}, {"type":"slot"}, {"type":"locked", "word":"boy"}, {"type":"locked", "word":"makes"}, {"type":"locked", "word":"a"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"."}]'::text,
    '[["The", "smart", "boy", "makes", "a", "clever", "trap", "."]]'::text,
    '{"targets": ["smart", "clever", "trap"], "distractors": ["silly", "boring", "house"]}'::text
  ),
  (
    5::int, 6::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/6_5_alpha_sb_narrate_tools.jpg'::text,
    'He looks around the garden for parts.'::text,
    NULL::text, NULL::text,
    'He gets a weighty cardboard container and a piece of wood.'::text,
    'उसे एक भारी (heavy) डिब्बा (box) और एक छड़ी (stick) मिलती है।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"locked", "word":"He"}, {"type":"locked", "word":"finds"}, {"type":"locked", "word":"a"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"and"}, {"type":"locked", "word":"a"}, {"type":"slot"}, {"type":"punct", "word":"."}]'::text,
    '[["He", "finds", "a", "heavy", "box", "and", "a", "stick", "."]]'::text,
    '{"targets": ["heavy", "box", "stick"], "distractors": ["light", "ball", "snake"]}'::text
  ),
  (
    5::int, 7::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/7_5_alpha_sb_narrate_bait.jpg'::text,
    'He needs something the goat wants to eat.'::text,
    NULL::text, NULL::text,
    'He places the orange vegetable beneath the cardboard.'::text,
    'वह डिब्बे के नीचे (under) एक मीठी (sweet) गाजर (carrot) रखता है।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"locked", "word":"He"}, {"type":"locked", "word":"puts"}, {"type":"locked", "word":"a"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"the"}, {"type":"locked", "word":"box"}, {"type":"punct", "word":"."}]'::text,
    '[["He", "puts", "a", "sweet", "carrot", "under", "the", "box", "."]]'::text,
    '{"targets": ["sweet", "carrot", "under"], "distractors": ["sour", "apple", "over"]}'::text
  ),
  (
    5::int, 8::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/8_5_alpha_sb_narrate_trigger.jpg'::text,
    'He needs a way to drop the box from far away.'::text,
    NULL::text, NULL::text,
    'He attaches a far-reaching thread to the wood.'::text,
    'वह छड़ी से एक लंबी (long) डोरी (string) बांधता है।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"locked", "word":"He"}, {"type":"locked", "word":"ties"}, {"type":"locked", "word":"a"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"to"}, {"type":"locked", "word":"the"}, {"type":"locked", "word":"stick"}, {"type":"punct", "word":"."}]'::text,
    '[["He", "ties", "a", "long", "string", "to", "the", "stick", "."]]'::text,
    '{"targets": ["long", "string"], "distractors": ["short", "snake"]}'::text
  ),
  (
    5::int, 9::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/9_5_alpha_sb_narrate_trap.jpg'::text,
    'The boy hides in the bushes. The goat smells the food!'::text,
    NULL::text, NULL::text,
    'The starving animal walks right into the middle of it.'::text,
    'भूखी (hungry) बकरी जाल के अंदर (inside) जाती है।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"locked", "word":"The"}, {"type":"slot"}, {"type":"locked", "word":"goat"}, {"type":"locked", "word":"goes"}, {"type":"slot"}, {"type":"locked", "word":"the"}, {"type":"locked", "word":"trap"}, {"type":"punct", "word":"."}]'::text,
    '[["The", "hungry", "goat", "goes", "inside", "the", "trap", "."]]'::text,
    '{"targets": ["hungry", "inside"], "distractors": ["full", "outside"]}'::text
  ),
  (
    5::int, 10::int, 'narrate'::text, 'The Naughty Goat'::text,
    'sb_alpha_5/10_5_alpha_sb_narrate_rescue.jpg'::text,
    'It''s time!'::text,
    NULL::text, NULL::text,
    'He yanks the thread and takes back what was stolen!'::text,
    'लड़का डोरी (string) खींचता है और चश्मा (glasses) ले लेता है!'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"locked", "word":"The"}, {"type":"locked", "word":"boy"}, {"type":"locked", "word":"pulls"}, {"type":"locked", "word":"the"}, {"type":"slot"}, {"type":"locked", "word":"and"}, {"type":"locked", "word":"gets"}, {"type":"locked", "word":"the"}, {"type":"slot"}, {"type":"punct", "word":"!"}]'::text,
    '[["The", "boy", "pulls", "the", "string", "and", "gets", "the", "glasses", "!"]]'::text,
    '{"targets": ["string", "glasses"], "distractors": ["rope", "shoes"]}'::text
  )
) AS v(step, session_order, mechanic, story_name, image_url, context_setting, speaker_character, anchor_text, hint_1, hint_2, time_limit_seconds, flash_duration_ms, session_intro, layout, valid_sentences, tiles) ON true
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
