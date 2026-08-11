-- 20260731000004_sb_demo_sessions.sql
-- Seed Demo sessions for Sentence Builder Alpha Step 1: The Magic Balloon

WITH
  sb_game AS (SELECT id FROM public.games WHERE key = 'sentence_builder' LIMIT 1),
  lvl_alpha AS (SELECT id FROM public.levels WHERE key = 'alpha' LIMIT 1)
INSERT INTO public.sentence_builder_sessions (
  game_id, level_id, step, session_order, mechanic, story_name,
  image_url, speaker_character, anchor_text,
  hint_1, hint_2, time_limit_seconds, session_intro,
  layout, valid_sentences, tiles
)
SELECT
  g.id, l.id,
  v.step, v.session_order, v.mechanic, v.story_name,
  v.image_url, v.speaker_character, v.anchor_text,
  v.hint_1, v.hint_2, v.time_limit_seconds, v.session_intro,
  v.layout::jsonb, v.valid_sentences::jsonb, v.tiles::jsonb
FROM sb_game g
CROSS JOIN lvl_alpha l
JOIN (VALUES
  (
    1, 1, 'recast', 'The Magic Balloon',
    'sb_alpha_1/1_1_alpha_sb_bal_sky.jpg', 'bibi', 'Look at that big balloon!',
    'What object is going up in the sky?', 'ध्यान दें, यह गेंद (ball) नहीं, बल्कि एक गुब्बारा (balloon) है!', 180,
    'Tap the word chips to fill the blanks and make the sentence match the picture.
वाक्य को चित्र के अनुसार पूरा करने के लिए शब्दों पर टैप करें।',
    '[{"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"floats"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["The", "balloon", "floats", "high", "."]]',
    '{"targets": ["The", "balloon", "high"], "distractors": ["ball", "low"]}'
  ),
  (
    1, 2, 'recast', 'The Magic Balloon',
    'sb_alpha_1/2_1_alpha_sb_bal_tre.jpg', 'bibi', 'Oh no! It cannot move.',
    'We use this word instead of saying ''balloon'' again.', 'निर्जीव चीज़ों (objects) के लिए हम ''It'' का इस्तेमाल करते हैं, ''He'' या ''She'' का नहीं।', 180,
    NULL,
    '[{"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"stuck"}, {"type":"punct", "word":"."}]',
    '[["It", "is", "stuck", "."]]',
    '{"targets": ["It", "is"], "distractors": ["He", "She", "are"]}'
  ),
  (
    1, 3, 'recast', 'The Magic Balloon',
    'sb_alpha_1/3_1_alpha_sb_mnk_tre.jpg', 'bibi', 'Who can help us?',
    'Who is going up the trunk?', 'तस्वीर में कौन सा जानवर है? यह एक बंदर (monkey) है!', 180,
    NULL,
    '[{"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"climbs"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["A", "monkey", "climbs", "the", "tree", "."]]',
    '{"targets": ["A", "monkey", "the", "tree"], "distractors": ["bird", "sky"]}'
  ),
  (
    1, 4, 'recast', 'The Magic Balloon',
    'sb_alpha_1/4_1_alpha_sb_mnk_giv.jpg', 'bibi', 'He got the balloon... but what will he do?',
    'The monkey is sharing the balloon.', 'बंदर हमें (us) गुब्बारा दे रहा है, किसी और को (them) नहीं।', 180,
    NULL,
    '[{"type":"slot"}, {"type":"locked", "word":"gives"}, {"type":"slot"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["He", "gives", "it", "to", "us", "."]]',
    '{"targets": ["He", "it", "to", "us"], "distractors": ["She", "them"]}'
  ),
  (
    1, 5, 'recast', 'The Magic Balloon',
    'sb_alpha_1/5_1_alpha_sb_kid_ply.jpg', 'bibi', 'Now what will you do?',
    'What are you doing with your friends?', 'जब हम सब साथ होते हैं, तो हम ''we'' का इस्तेमाल करते हैं, ''they'' का नहीं।', 180,
    NULL,
    '[{"type":"locked", "word":"Yesssssss"}, {"type":"punct", "word":"!"}, {"type":"slot"}, {"type":"slot"}, {"type":"locked", "word":"smile"}, {"type":"slot"}, {"type":"slot"}, {"type":"punct", "word":"."}]',
    '[["Yesssssss", "!", "Now", "we", "smile", "and", "play", "."]]',
    '{"targets": ["Now", "we", "and", "play"], "distractors": ["sad", "they"]}'
  )
) AS v(
  step, session_order, mechanic, story_name,
  image_url, speaker_character, anchor_text,
  hint_1, hint_2, time_limit_seconds, session_intro,
  layout, valid_sentences, tiles
) ON true;
