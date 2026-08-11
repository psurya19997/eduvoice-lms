-- 20260801000008_sb_demo_sessions_step4.sql

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
    4::int, 1::int, 'recast'::text, 'Help Chotu!'::text,
    'sb_alpha_4/1_4_alpha_sb_recast_sister.jpg'::text,
    'Oops! Chotu used the wrong word for a girl. Can you fix it?'::text,
    'chotu'::text,
    'He is my sister.'::text,
    'What word do we use for a girl?'::text,
    'लड़की (girl) के लिए हम ''She'' का उपयोग करते हैं।'::text,
    180::int, NULL::int,
    'Chotu needs your help! He is making some silly mistakes. Tap the right words to fix his sentences!'::text,
    '[{"type":"slot"},{"type":"word","word":"is"},{"type":"word","word":"my"},{"type":"word","word":"sister"},{"type":"punct","word":"."}]'::text,
    '[["She","is","my","sister","."]]'::text,
    '[{"id":"t1","word":"She"},{"id":"t2","word":"He"},{"id":"t3","word":"They"}]'::text
  ),
  (
    4::int, 2::int, 'recast'::text, 'Help Chotu!'::text,
    'sb_alpha_4/2_4_alpha_sb_recast_balloon.jpg'::text,
    'Wait... that doesn''t sound right.'::text,
    'chotu'::text,
    'She have a red balloon.'::text,
    'With ''She'' or ''He'', we use ''has''.'::text,
    '''She'' के साथ ''has'' आता है।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"word","word":"She"},{"type":"slot"},{"type":"word","word":"a"},{"type":"word","word":"red"},{"type":"word","word":"balloon"},{"type":"punct","word":"."}]'::text,
    '[["She","has","a","red","balloon","."]]'::text,
    '[{"id":"t1","word":"has"},{"id":"t2","word":"have"},{"id":"t3","word":"is"}]'::text
  ),
  (
    4::int, 3::int, 'recast'::text, 'Help Chotu!'::text,
    'sb_alpha_4/3_4_alpha_sb_recast_apple.jpg'::text,
    'Chotu forgot a small word before ''apple''.'::text,
    'chotu'::text,
    'I want apple.'::text,
    '''Apple'' starts with a vowel sound (A, E, I, O, U).'::text,
    '''Apple'' स्वर (vowel) से शुरू होता है, इसलिए ''an'' चुनें।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"word","word":"I"},{"type":"word","word":"want"},{"type":"slot"},{"type":"word","word":"apple"},{"type":"punct","word":"."}]'::text,
    '[["I","want","an","apple","."]]'::text,
    '[{"id":"t1","word":"an"},{"id":"t2","word":"a"},{"id":"t3","word":"the"}]'::text
  ),
  (
    4::int, 4::int, 'recast'::text, 'Help Chotu!'::text,
    'sb_alpha_4/4_4_alpha_sb_recast_cars.jpg'::text,
    'If there is more than one, what do we add at the end?'::text,
    'chotu'::text,
    'I see three car.'::text,
    'Because there are ''three'', the word needs an ''s'' at the end.'::text,
    'एक से ज़्यादा हैं, इसलिए अंत में ''s'' लगाएँ।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"word","word":"I"},{"type":"word","word":"see"},{"type":"word","word":"three"},{"type":"slot"},{"type":"punct","word":"."}]'::text,
    '[["I","see","three","cars","."]]'::text,
    '[{"id":"t1","word":"cars"},{"id":"t2","word":"car"},{"id":"t3","word":"cat"}]'::text
  ),
  (
    4::int, 5::int, 'recast'::text, 'Help Chotu!'::text,
    'sb_alpha_4/5_4_alpha_sb_recast_dogs.jpg'::text,
    'Oh boy, Chotu made two mistakes this time! Fix the verb AND the noun.'::text,
    'chotu'::text,
    'He have two dog.'::text,
    'Remember, ''He'' goes with ''has'', and ''two'' means we need an ''s''.'::text,
    '''He'' के साथ ''has'' आता है, और दो हैं इसलिए ''dogs''।'::text,
    180::int, NULL::int,
    NULL::text,
    '[{"type":"word","word":"He"},{"type":"slot"},{"type":"word","word":"two"},{"type":"slot"},{"type":"punct","word":"."}]'::text,
    '[["He","has","two","dogs","."]]'::text,
    '[{"id":"t1","word":"has"},{"id":"t2","word":"have"},{"id":"t3","word":"dogs"},{"id":"t4","word":"dog"}]'::text
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
