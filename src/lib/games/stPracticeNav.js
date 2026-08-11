// Navigation helpers for the practice-item flow.
//
// The two batches:
//   Inline batch  — items where session_id = <paragraph_id>. Shown after that paragraph.
//   Story-end batch — items where session_id IS NULL. Shown after the last paragraph.
//
// A student traverses items in order of item_order within each batch. After the
// last item in an inline batch, they advance to the next paragraph (or, if this
// was the last paragraph, to the story-end batch, then to complete).

import { supabase } from '../supabase.js';

// Ordered list of active practice items attached to a specific paragraph.
export async function fetchInlineItems(sessionId) {
  const { data } = await supabase
    .from('storyteller_practice_items')
    .select('*')
    .eq('session_id', sessionId)
    .eq('is_active', true)
    .order('item_order', { ascending: true });
  return data ?? [];
}

// Ordered list of active practice items at the story-end (session_id IS NULL).
export async function fetchStoryEndItems({ gameId, levelId, step }) {
  const { data } = await supabase
    .from('storyteller_practice_items')
    .select('*')
    .eq('game_id', gameId)
    .eq('level_id', levelId)
    .eq('step', step)
    .is('session_id', null)
    .eq('is_active', true)
    .order('item_order', { ascending: true });
  return data ?? [];
}

// Given the current item + its siblings, return the next item in the batch
// (by item_order). Returns null if this was the last one.
export function findNextItem(currentId, siblings) {
  const idx = siblings.findIndex((s) => s.id === currentId);
  if (idx < 0) return null;
  return siblings[idx + 1] ?? null;
}

/**
 * Build the URL that transitions the child to a practice item.
 * The URL carries level/step/sessionOrder so STPractice can navigate onwards
 * without another back-lookup once the item is finished.
 */
export function buildPracticeUrl({ level, step, sessionOrder, itemId, batch }) {
  const params = new URLSearchParams({
    level, step: String(step), item: itemId, batch,
  });
  if (sessionOrder != null) params.set('session', String(sessionOrder));
  return `/student/games/storyteller/practice?${params.toString()}`;
}

export function buildSessionUrl({ level, step, sessionOrder }) {
  return `/student/games/storyteller/play?level=${level}&step=${step}&session=${sessionOrder}`;
}

export function buildCompleteUrl({ level, step }) {
  return `/student/games/storyteller/complete?level=${level}&step=${step}`;
}

export function buildBonusUrl({ level, step }) {
  return `/student/games/storyteller/bonus?level=${level}&step=${step}`;
}
