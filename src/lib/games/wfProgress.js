import { supabase } from '../supabase.js';
import { getRefs } from './wfRefs.js';

const DEFAULT_LEVELS = [
  { key: 'alpha', title: 'Alpha', description: '' },
  { key: 'beta', title: 'Beta', description: '' },
  { key: 'gamma', title: 'Gamma', description: '' },
];

/**
 * Progress across all steps of a Word Family level.
 * No cooldown, no gating — any step is playable any time.
 * A step is "fully played" when every session in it has ≥1 completed/timeout attempt.
 * `frontierStep` is a visual "recommended next" hint = lowest step with content that isn't fully played.
 */
export async function loadWfProgress(studentId, requestedLevelKey = null) {
  try {
    const refs = await getRefs();
    const gameId = refs.games.word_family;

    // 1. Fetch all available game levels from database
    const { data: levelsRows } = await supabase
      .from('levels')
      .select('id, key, title, description')
      .order('id', { ascending: true });
    const levelsData = (levelsRows && levelsRows.length) ? levelsRows : DEFAULT_LEVELS;
    const levelMapById = new Map(levelsData.map((l) => [l.id, l.key]));
    const levelMapByKey = new Map(levelsData.map((l) => [l.key, l]));

    if (!gameId) {
      return fallbackProgress(levelsData, requestedLevelKey);
    }

    // 2. Fetch all active sessions across all levels for Word Family
    const { data: sessions } = await supabase
      .from('word_family_sessions')
      .select('id, step, level_id')
      .eq('game_id', gameId)
      .eq('is_active', true);
    const sessionIds = (sessions ?? []).map((s) => s.id);

    // 3. Which sessions has the student completed/timed-out at least once?
    const completedSessionIds = new Set();
    if (sessionIds.length) {
      const { data: attempts } = await supabase
        .from('word_family_attempts')
        .select('session_id')
        .eq('student_id', studentId)
        .in('session_id', sessionIds)
        .in('attempt_status', ['completed', 'timeout']);
      for (const a of attempts ?? []) completedSessionIds.add(a.session_id);
    }

    // 4. Organize per (level, step). `freshCount`/`allLocked` are kept as
    //    stable return-shape fields but are no-ops now (no cooldown).
    //    `done` = distinct sessions completed at least once (mirrors SB shape).
    //    `isComplete` fires when every session in the step has been completed.
    const progressByLevel = new Map();
    for (const lvl of levelsData) {
      const stepMap = new Map();
      for (let i = 1; i <= 10; i++) {
        stepMap.set(i, {
          step: i,
          total: 0,
          done: 0,
          freshCount: 0,
          allLocked: false,
          started: false,
          isComplete: false,
          isFrontier: false,
        });
      }
      progressByLevel.set(lvl.key, stepMap);
    }

    for (const s of sessions ?? []) {
      const lvlKey = levelMapById.get(s.level_id) ?? 'alpha';
      const stepMap = progressByLevel.get(lvlKey);
      if (!stepMap) continue;
      const bucket = stepMap.get(s.step);
      if (!bucket) continue;

      bucket.total += 1;
      bucket.freshCount += 1;
      if (completedSessionIds.has(s.id)) {
        bucket.done += 1;
        bucket.started = true;
      }
    }

    // Mark isComplete now that totals are known.
    for (const stepMap of progressByLevel.values()) {
      for (const b of stepMap.values()) {
        b.isComplete = b.total > 0 && b.done === b.total;
      }
    }

    // 5. Recommended level = highest level the student has ever touched.
    let frontierLevel = levelsData[0]?.key ?? 'alpha';
    for (let idx = 0; idx < levelsData.length; idx++) {
      const lvlKey = levelsData[idx].key;
      const stepMap = progressByLevel.get(lvlKey);
      const startedArray = Array.from(stepMap?.values() ?? []).filter((s) => s.started);
      if (startedArray.length > 0) frontierLevel = lvlKey;
    }

    // 6. Select target level (either requested via URL or the recommended one).
    const activeLevelKey = requestedLevelKey && levelMapByKey.has(requestedLevelKey)
      ? requestedLevelKey
      : frontierLevel;

    const activeStepMap = progressByLevel.get(activeLevelKey) ?? new Map();

    // 7. Frontier step = lowest step in this level with content that isn't fully played.
    //    Fallback to the highest step if every step is either empty or fully played.
    let frontierStep = 1;
    for (let i = 1; i <= 10; i++) {
      const b = activeStepMap.get(i);
      if (b?.total > 0 && !b.isComplete) {
        frontierStep = i;
        break;
      }
      if (b?.total > 0) frontierStep = i; // remember last step-with-content as fallback
    }

    // Tag the frontier for UI highlighting.
    for (const b of activeStepMap.values()) {
      b.isFrontier = b.step === frontierStep && !b.isComplete;
    }

    const stepsArray = Array.from(activeStepMap.values());
    const startedArray = stepsArray.filter((s) => s.started);
    const completedCount = stepsArray.filter((s) => s.isComplete).length;

    return {
      started: startedArray.length,      // # of steps with any completed session
      completed: completedCount,          // # of fully-played steps
      total: 10,
      frontierStep,
      frontierLevel,
      activeLevelKey,
      stepsMeta: stepsArray,
      levelsData,
    };
  } catch (e) {
    return fallbackProgress(DEFAULT_LEVELS, requestedLevelKey);
  }
}

function fallbackProgress(levelsData, requestedLevelKey) {
  const activeKey = requestedLevelKey ?? levelsData[0]?.key ?? 'alpha';
  const stepsMeta = [];
  for (let i = 1; i <= 10; i++) {
    stepsMeta.push({
      step: i, total: 0, done: 0, freshCount: 0, allLocked: false,
      started: false, isComplete: false, isFrontier: i === 1,
    });
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
