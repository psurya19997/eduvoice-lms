// Story Teller flow graph — computes the ordered list of every node in a step
// (paragraphs, inline items, story-end items, bonus Q&A) and tells you where
// the student should resume.
//
// A node is one thing the kid can be looking at:
//   { type: 'session',  sessionId, sessionOrder }
//   { type: 'practice', itemId, batch: 'inline'|'storyend', sessionOrder|null }
//   { type: 'bonus' }
//
// Sequence for a step:
//   Session 1 → (inline items of S1) → Session 2 → (inline items of S2) →
//   ... → Session N → (story-end items) → Bonus
//
// resumeIndex = index of the first not-yet-completed node in that list.
// When the student has finished everything, resumeIndex === nodes.length,
// meaning "next stop is the complete screen".
//
// Completion signals:
//   session:  storyteller_attempts row with choice_made='understood'
//   practice: storyteller_practice_attempts row with attempt_status='completed'
//   bonus:    any storyteller_bonus_attempts row (visited = done for resume purposes)

import { supabase } from '../supabase.js';
import {
  buildSessionUrl, buildPracticeUrl, buildBonusUrl, buildCompleteUrl,
} from './stPracticeNav.js';

export async function getFlow({ studentId, gameId, levelId, step }) {
  // 1. Sessions (paragraphs) in order.
  const { data: sessions } = await supabase
    .from('storyteller_sessions')
    .select('id, session_order')
    .eq('game_id',  gameId)
    .eq('level_id', levelId)
    .eq('step',     step)
    .eq('is_active', true)
    .order('session_order', { ascending: true });

  // 2. All practice items for this step (inline + story-end).
  const { data: items } = await supabase
    .from('storyteller_practice_items')
    .select('id, session_id, item_order')
    .eq('game_id',  gameId)
    .eq('level_id', levelId)
    .eq('step',     step)
    .eq('is_active', true);

  const inlineBySession = new Map();
  const storyEndItems   = [];
  for (const it of items ?? []) {
    if (it.session_id) {
      if (!inlineBySession.has(it.session_id)) inlineBySession.set(it.session_id, []);
      inlineBySession.get(it.session_id).push(it);
    } else {
      storyEndItems.push(it);
    }
  }
  for (const arr of inlineBySession.values()) arr.sort((a, b) => a.item_order - b.item_order);
  storyEndItems.sort((a, b) => a.item_order - b.item_order);

  // 3. Interleave into the flow node list.
  const nodes = [];
  for (const s of sessions ?? []) {
    nodes.push({ type: 'session', sessionId: s.id, sessionOrder: s.session_order });
    for (const it of inlineBySession.get(s.id) ?? []) {
      nodes.push({
        type: 'practice', itemId: it.id, batch: 'inline',
        sessionOrder: s.session_order,
      });
    }
  }
  for (const it of storyEndItems) {
    nodes.push({
      type: 'practice', itemId: it.id, batch: 'storyend',
      sessionOrder: null,
    });
  }
  nodes.push({ type: 'bonus' });

  // 4. Fetch completion signals in parallel.
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const itemIds    = (items    ?? []).map((it) => it.id);

  const [sessionAttempts, itemAttempts, bonusAttempts] = await Promise.all([
    sessionIds.length
      ? supabase.from('storyteller_attempts')
          .select('session_id')
          .eq('student_id', studentId)
          .eq('choice_made', 'understood')
          .in('session_id', sessionIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    itemIds.length
      ? supabase.from('storyteller_practice_attempts')
          .select('practice_item_id')
          .eq('student_id', studentId)
          .eq('attempt_status', 'completed')
          .in('practice_item_id', itemIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    supabase.from('storyteller_bonus_attempts')
      .select('id')
      .eq('student_id', studentId)
      .eq('level_id',   levelId)
      .eq('step',       step)
      .limit(1)
      .then((r) => r.data ?? []),
  ]);

  const doneSessions = new Set(sessionAttempts.map((a) => a.session_id));
  const doneItems    = new Set(itemAttempts.map((a) => a.practice_item_id));
  const bonusVisited = bonusAttempts.length > 0;

  // 5. Resume index = first node that isn't done.
  //    If every node is done, resumeIndex === nodes.length (→ complete screen).
  let resumeIndex = nodes.length;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const done =
      n.type === 'session'  ? doneSessions.has(n.sessionId)
    : n.type === 'practice' ? doneItems.has(n.itemId)
    :                         bonusVisited;   // bonus
    if (!done) { resumeIndex = i; break; }
  }

  return { nodes, resumeIndex };
}

// Turn a node into the URL that renders it. `resumeIndex >= nodes.length`
// (i.e., no node) falls back to the complete screen.
export function nodeToUrl(node, { level, step }) {
  if (!node) return buildCompleteUrl({ level, step });
  if (node.type === 'session') {
    return buildSessionUrl({ level, step, sessionOrder: node.sessionOrder });
  }
  if (node.type === 'practice') {
    return buildPracticeUrl({
      level, step,
      sessionOrder: node.sessionOrder,
      itemId: node.itemId,
      batch:  node.batch,
    });
  }
  if (node.type === 'bonus') return buildBonusUrl({ level, step });
  return buildCompleteUrl({ level, step });
}

// Find where the current page sits in the node list. Returns -1 if not found.
export function indexOfCurrent(nodes, { sessionOrder, itemId }) {
  if (itemId != null) {
    return nodes.findIndex((n) => n.type === 'practice' && n.itemId === itemId);
  }
  if (sessionOrder != null) {
    return nodes.findIndex((n) => n.type === 'session' && n.sessionOrder === sessionOrder);
  }
  return -1;
}
