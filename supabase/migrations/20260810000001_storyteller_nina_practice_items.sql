-- 20260810000001_storyteller_nina_practice_items.sql
-- Seed 2 story-end tasks for the Nina story (alpha, step 1).
-- Bonus Q&A is enabled by default (bonus_qna_cap_seconds=180 from the Phase 2 schema migration).

WITH
  st_game    AS (SELECT id FROM public.games  WHERE key = 'story_teller' LIMIT 1),
  lvl_alpha  AS (SELECT id FROM public.levels WHERE key = 'alpha'        LIMIT 1)
INSERT INTO public.storyteller_practice_items (
  game_id, level_id, step, session_id, mode, item_order, content, duration_cap_seconds
)
SELECT g.id, l.id, 1, NULL, 'task', v.item_order, v.content::jsonb, v.duration_cap_seconds
FROM st_game g
CROSS JOIN lvl_alpha l
JOIN (VALUES
  (
    1,
    '{
      "prompt": "Tell the whole story of Nina in your own words.",
      "beats": [
        { "id": "b1", "text": "Nina wanted to learn to ride a cycle" },
        { "id": "b2", "text": "she fell but Papa encouraged her to try again" },
        { "id": "b3", "text": "she succeeded and dreamed of riding to school with Rahul" }
      ]
    }',
    120
  ),
  (
    2,
    '{
      "prompt": "Pretend you are Nina. Tell your friend how you learned to ride the cycle.",
      "beats": [
        { "id": "b1", "text": "uses first-person voice (I / mera / mujhe)" },
        { "id": "b2", "text": "mentions falling down and trying again" },
        { "id": "b3", "text": "shows feeling proud or happy after succeeding" }
      ]
    }',
    90
  )
) AS v(item_order, content, duration_cap_seconds) ON true;
