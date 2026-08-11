// Progress across all steps of a Sentence Builder level.
// SB uses strict linear order (no LRU, no cooldown — see PRD §1.6).
// A step is "done" when every session in it has ≥1 completed attempt by this student.
// Frontier = lowest step with any incomplete session.

import { supabase } from '../supabase.js';
import { getRefs } from './wfRefs.js';

const DEFAULT_LEVELS = [
  { key: 'alpha', title: 'Alpha' },
  { key: 'beta', title: 'Beta' },
  { key: 'gamma', title: 'Gamma' },
];

/**
 * @param {string} studentId
 * @param {string} requestedLevelKey  e.g. 'alpha'
 * @returns {Promise<{
 *   started: number,          // steps with any completed attempt
 *   completed: number,        // steps where ALL sessions are completed
 *   total: number,            // always 10
 *   frontierStep: number,     // lowest step with an incomplete session
 *   frontierLevel: string,    // e.g. 'alpha'
 *   activeLevelKey: string,
 *   stepsMeta: Array<{ step: number, total: number, done: number, isFrontier: boolean, isLocked: boolean, isComplete: boolean }>,
 *   levelsData: Array<{ key: string, title: string }>
 * }>}
 */
export async function loadSbProgress(studentId, requestedLevelKey = null) {
  try {
    const refs = await getRefs();
    const gameId = refs.games.sentence_builder;

    // levels table has `display_name`, not `title` — map it so downstream keeps calling it `title`.
    const { data: levelsRows } = await supabase
      .from('levels')
      .select('id, key, title:display_name, ordinal')
      .order('ordinal', { ascending: true });
    const levelsData = (levelsRows && levelsRows.length)
      ? levelsRows.map((l) => ({ id: l.id, key: l.key, title: l.title }))
      : DEFAULT_LEVELS;
    const levelMapByKey = new Map(levelsData.map((l) => [l.key, l]));

    if (!gameId) return fallback(levelsData, requestedLevelKey);

    const activeLevelKey = requestedLevelKey && levelMapByKey.has(requestedLevelKey)
      ? requestedLevelKey
      : levelsData[0]?.key ?? 'alpha';
    const activeLevel = levelMapByKey.get(activeLevelKey);
    if (!activeLevel) return fallback(levelsData, requestedLevelKey);

    // Fetch all active sessions in this level.
    const { data: sessions } = await supabase
      .from('sentence_builder_sessions')
      .select('id, step')
      .eq('game_id', gameId)
      .eq('level_id', activeLevel.id)
      .eq('is_active', true);

    const sessionIds = (sessions ?? []).map((s) => s.id);

    // Fetch completed attempts for this student in these sessions.
    let completedSessionIds = new Set();
    if (sessionIds.length && studentId) {
      const { data: attempts } = await supabase
        .from('sentence_builder_attempts')
        .select('session_id')
        .eq('student_id', studentId)
        .eq('attempt_status', 'completed')
        .in('session_id', sessionIds);
      completedSessionIds = new Set((attempts ?? []).map((a) => a.session_id));
    }

    // Build per-step meta for steps 1..10.
    const stepBuckets = new Map();
    for (let i = 1; i <= 10; i += 1) {
      stepBuckets.set(i, { step: i, total: 0, done: 0, isFrontier: false, isLocked: false, isComplete: false });
    }
    for (const s of sessions ?? []) {
      const bucket = stepBuckets.get(s.step);
      if (!bucket) continue;
      bucket.total += 1;
      if (completedSessionIds.has(s.id)) bucket.done += 1;
    }

    // Determine frontier step: lowest step where total > 0 AND done < total.
    // Fallback when nothing matches (all authored content is done): use the
    // HIGHEST step with content so "Continue" points to the last thing the kid
    // played rather than resetting to Step 1.
    let frontierStep = 1;
    let foundFrontier = false;
    for (let i = 1; i <= 10; i += 1) {
      const b = stepBuckets.get(i);
      if (!foundFrontier && b.total > 0 && b.done < b.total) {
        frontierStep = i;
        foundFrontier = true;
      }
      if (!foundFrontier && b.total > 0) {
        // Track last step-with-content as fallback.
        frontierStep = i;
      }
    }

    // Mark step meta. All steps are freely playable — isLocked is always false.
    // isFrontier remains as a visual "▶ Play" hint, not a gate.
    for (const b of stepBuckets.values()) {
      b.isComplete = b.total > 0 && b.done === b.total;
      b.isFrontier = b.step === frontierStep && !b.isComplete;
      b.isLocked = false;
    }

    const stepsArray = Array.from(stepBuckets.values());
    const completed = stepsArray.filter((s) => s.isComplete).length;
    const started = stepsArray.filter((s) => s.done > 0).length;

    return {
      started,
      completed,
      total: 10,
      frontierStep,
      frontierLevel: activeLevelKey,
      activeLevelKey,
      stepsMeta: stepsArray,
      levelsData,
    };
  } catch (e) {
    return fallback(DEFAULT_LEVELS, requestedLevelKey);
  }
}

function fallback(levelsData, requestedLevelKey) {
  const activeKey = requestedLevelKey ?? levelsData[0]?.key ?? 'alpha';
  const stepsMeta = [];
  for (let i = 1; i <= 10; i += 1) {
    stepsMeta.push({ step: i, total: 0, done: 0, isFrontier: i === 1, isLocked: false, isComplete: false });
  }
  return {
    started: 0,
    completed: 0,
    total: 10,
    frontierStep: 1,
    frontierLevel: 'alpha',
    activeLevelKey: activeKey,
    stepsMeta,
    levelsData,
  };
}
