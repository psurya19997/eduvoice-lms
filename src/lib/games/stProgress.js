// Story Teller progress loader.
// A "step" in Story Teller = one whole story. A "session" = one paragraph.
// A story is COMPLETE when every paragraph of that step has at least one
// attempt with choice_made = 'understood' (the only forward-motion choice).
//
// This mirrors the shape of wfProgress so STHub can consume it the same way.

import { supabase } from '../supabase.js';
import { getRefs } from './wfRefs.js';

const DEFAULT_LEVELS = [
  { key: 'alpha', title: 'Alpha', description: '' },
  { key: 'beta',  title: 'Beta',  description: '' },
  { key: 'gamma', title: 'Gamma', description: '' },
];

export async function loadStProgress(studentId, requestedLevelKey = null) {
  try {
    const refs = await getRefs();
    const gameId = refs.games.story_teller;

    // NOTE: the levels table actually has `display_name`, not `title`.
    // Normalize to { key, title } for the UI consumer (STHub).
    const { data: levelsRows } = await supabase
      .from('levels')
      .select('id, key, display_name, cefr_level, ordinal')
      .order('ordinal', { ascending: true });
    const levelsData = (levelsRows && levelsRows.length)
      ? levelsRows.map((r) => ({ id: r.id, key: r.key, title: r.display_name, description: r.cefr_level ?? '' }))
      : DEFAULT_LEVELS;
    const levelMapById  = new Map(levelsData.map((l) => [l.id, l.key]));
    const levelMapByKey = new Map(levelsData.map((l) => [l.key, l]));

    if (!gameId) return fallbackProgress(levelsData, requestedLevelKey);

    // 1. All active storyteller_sessions (paragraphs) — grouped by (level, step).
    const { data: sessions } = await supabase
      .from('storyteller_sessions')
      .select('id, step, level_id, session_order, story_name')
      .eq('game_id', gameId)
      .eq('is_active', true);
    const sessionIds = (sessions ?? []).map((s) => s.id);

    // 2. Which paragraphs has the student completed with 'understood'?
    const understoodSessionIds = new Set();
    if (sessionIds.length) {
      const { data: attempts } = await supabase
        .from('storyteller_attempts')
        .select('session_id')
        .eq('student_id', studentId)
        .eq('choice_made', 'understood')
        .in('session_id', sessionIds);
      for (const a of attempts ?? []) understoodSessionIds.add(a.session_id);
    }

    // 3. Per-level bucket map. Slots 1..10 always present so UI shape is stable.
    const progressByLevel = new Map();
    for (const lvl of levelsData) {
      const stepMap = new Map();
      for (let i = 1; i <= 10; i++) {
        stepMap.set(i, {
          step: i,
          total: 0,         // # of paragraphs in this story (0 if no content)
          done: 0,          // # of paragraphs the student has understood
          started: false,
          isComplete: false,
          isFrontier: false,
          storyName: null,
          firstSessionId: null,   // paragraph 1 — where "Read Story" opens
        });
      }
      progressByLevel.set(lvl.key, stepMap);
    }

    // 4. Fold sessions into the bucket map.
    for (const s of sessions ?? []) {
      const lvlKey = levelMapById.get(s.level_id);
      if (!lvlKey) continue;
      const bucket = progressByLevel.get(lvlKey)?.get(s.step);
      if (!bucket) continue;

      bucket.total += 1;
      bucket.storyName = bucket.storyName ?? s.story_name;
      if (s.session_order === 1) bucket.firstSessionId = s.id;
      if (understoodSessionIds.has(s.id)) {
        bucket.done += 1;
        bucket.started = true;
      }
    }
    for (const stepMap of progressByLevel.values()) {
      for (const b of stepMap.values()) {
        b.isComplete = b.total > 0 && b.done === b.total;
      }
    }

    // 5. Frontier level = latest level the student has touched.
    let frontierLevel = levelsData[0]?.key ?? 'alpha';
    for (const lvl of levelsData) {
      const stepMap = progressByLevel.get(lvl.key);
      if (Array.from(stepMap?.values() ?? []).some((s) => s.started)) {
        frontierLevel = lvl.key;
      }
    }

    // 6. Active level (URL param wins over frontier).
    const activeLevelKey = requestedLevelKey && levelMapByKey.has(requestedLevelKey)
      ? requestedLevelKey
      : frontierLevel;

    const activeStepMap = progressByLevel.get(activeLevelKey) ?? new Map();

    // 7. Frontier step = lowest with content that isn't fully done.
    let frontierStep = 1;
    for (let i = 1; i <= 10; i++) {
      const b = activeStepMap.get(i);
      if (b?.total > 0 && !b.isComplete) { frontierStep = i; break; }
      if (b?.total > 0) frontierStep = i;
    }
    for (const b of activeStepMap.values()) {
      b.isFrontier = b.step === frontierStep && !b.isComplete;
    }

    const stepsArray = Array.from(activeStepMap.values());
    const startedArray = stepsArray.filter((s) => s.started);
    const completedCount = stepsArray.filter((s) => s.isComplete).length;

    return {
      started: startedArray.length,
      completed: completedCount,
      total: 10,
      frontierStep,
      frontierLevel,
      activeLevelKey,
      stepsMeta: stepsArray,
      levelsData,
    };
  } catch {
    return fallbackProgress(DEFAULT_LEVELS, requestedLevelKey);
  }
}

function fallbackProgress(levelsData, requestedLevelKey) {
  const activeKey = requestedLevelKey ?? levelsData[0]?.key ?? 'alpha';
  const stepsMeta = [];
  for (let i = 1; i <= 10; i++) {
    stepsMeta.push({
      step: i, total: 0, done: 0, started: false,
      isComplete: false, isFrontier: i === 1,
      storyName: null, firstSessionId: null,
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
