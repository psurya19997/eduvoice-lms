-- 20260731000007_sb_demo_sessions_step4.sql
-- Rewrite of Alpha Step 4 sessions ("Help Chotu!") into the app's expected schema.
--
-- Prior seed used:
--   layout cells with type "word" for pre-filled words
--   tiles as an array of { id, word } objects
--
-- Correct schema (matches Steps 1–3 and the frontend rendering code):
--   layout cells use type "locked" for pre-filled words
--   tiles is { targets: [...], distractors: [...] } of plain word strings
--
-- Targets are derived from each session's valid_sentence at the slot indices.

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
  -- Session 1: "He is my sister." → "She is my sister."  (slot 0 = She)
  (
    4, 1, 'recast', 'Help Chotu!',
    'sb_alpha_4/1_4_alpha_sb_recast_sister.jpg',
    'Oops! Chotu used the wrong word for a girl. Can you fix it?',
    'chotu', 'He is my sister.',
    'What word do we use for a girl?',
    'लड़की (girl) के लिए हम ''She'' का उपयोग करते हैं।',
    180,
    'Chotu needs your help! He is making some silly mistakes. Tap the right words to fix his sentences!',
    '[{"type":"slot"}, {"type":"locked","word":"is"}, {"type":"locked","word":"my"}, {"type":"locked","word":"sister"}, {"type":"punct","word":"."}]',
    '[["She","is","my","sister","."]]',
    '{"targets":["She"],"distractors":["He","They"]}'
  ),
  -- Session 2: "She have a red balloon." → "She has a red balloon."  (slot 1 = has)
  (
    4, 2, 'recast', 'Help Chotu!',
    'sb_alpha_4/2_4_alpha_sb_recast_balloon.jpg',
    'Wait... that doesn''t sound right.',
    'chotu', 'She have a red balloon.',
    'With ''She'' or ''He'', we use ''has''.',
    '''She'' के साथ ''has'' आता है।',
    180,
    NULL,
    '[{"type":"locked","word":"She"}, {"type":"slot"}, {"type":"locked","word":"a"}, {"type":"locked","word":"red"}, {"type":"locked","word":"balloon"}, {"type":"punct","word":"."}]',
    '[["She","has","a","red","balloon","."]]',
    '{"targets":["has"],"distractors":["have","is"]}'
  ),
  -- Session 3: "I want apple." → "I want an apple."  (slot 2 = an)
  (
    4, 3, 'recast', 'Help Chotu!',
    'sb_alpha_4/3_4_alpha_sb_recast_apple.jpg',
    'Chotu forgot a small word before ''apple''.',
    'chotu', 'I want apple.',
    '''Apple'' starts with a vowel sound (A, E, I, O, U).',
    '''Apple'' स्वर (vowel) से शुरू होता है, इसलिए ''an'' चुनें।',
    180,
    NULL,
    '[{"type":"locked","word":"I"}, {"type":"locked","word":"want"}, {"type":"slot"}, {"type":"locked","word":"apple"}, {"type":"punct","word":"."}]',
    '[["I","want","an","apple","."]]',
    '{"targets":["an"],"distractors":["a","the"]}'
  ),
  -- Session 4: "I see three car." → "I see three cars."  (slot 3 = cars)
  (
    4, 4, 'recast', 'Help Chotu!',
    'sb_alpha_4/4_4_alpha_sb_recast_cars.jpg',
    'If there is more than one, what do we add at the end?',
    'chotu', 'I see three car.',
    'Because there are ''three'', the word needs an ''s'' at the end.',
    'एक से ज़्यादा हैं, इसलिए अंत में ''s'' लगाएँ।',
    180,
    NULL,
    '[{"type":"locked","word":"I"}, {"type":"locked","word":"see"}, {"type":"locked","word":"three"}, {"type":"slot"}, {"type":"punct","word":"."}]',
    '[["I","see","three","cars","."]]',
    '{"targets":["cars"],"distractors":["car","cat"]}'
  ),
  -- Session 5: "He have two dog." → "He has two dogs."  (slot 1 = has, slot 3 = dogs)
  (
    4, 5, 'recast', 'Help Chotu!',
    'sb_alpha_4/5_4_alpha_sb_recast_dogs.jpg',
    'Oh boy, Chotu made two mistakes this time! Fix the verb AND the noun.',
    'chotu', 'He have two dog.',
    'Remember, ''He'' goes with ''has'', and ''two'' means we need an ''s''.',
    '''He'' के साथ ''has'' आता है, और दो हैं इसलिए ''dogs''।',
    180,
    NULL,
    '[{"type":"locked","word":"He"}, {"type":"slot"}, {"type":"locked","word":"two"}, {"type":"slot"}, {"type":"punct","word":"."}]',
    '[["He","has","two","dogs","."]]',
    '{"targets":["has","dogs"],"distractors":["have","dog"]}'
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
