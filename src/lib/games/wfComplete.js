// Writes all consequences of finishing a Word Family session:
//   word_family_attempts (always)
//   game_score           (unless aborted)
//   student_skill_mastery + history  (unless aborted or timeout)
//
// See docs/games/04-data-model.md for the universal rules and EWMA formula.
// Sequential client-side writes — acceptable while RLS is disabled.
// A server RPC would be the future upgrade for atomicity.

import { supabase } from '../supabase.js';
import { getRefs } from './wfRefs.js';

const ALPHA = 0.15; // EWMA learning rate

/**
 * @param {{
 *   studentId: string,
 *   sessionId: string,
 *   level: 'alpha'|'beta'|'gamma',
 *   picks: string[],
 *   scoring: { score:number, is_correct:boolean, correct_picks_count:number, wrong_picks_count:number, total_targets:number },
 *   durationMs: number,
 *   attemptStatus: 'completed'|'timeout'|'aborted',
 * }} args
 * @returns {Promise<{ attemptId: string, masteryDeltas: Array<{skill:string, oldValue:number, newValue:number}> }>}
 */
export async function wfComplete(args) {
  const {
    studentId, sessionId, level, picks, scoring, durationMs, attemptStatus,
  } = args;

  const refs = await getRefs();
  const gameId = refs.games.word_family;

  // 1) Always insert an attempt row.
  const { data: attemptRow, error: aErr } = await supabase
    .from('word_family_attempts')
    .insert({
      student_id: studentId,
      session_id: sessionId,
      picks,
      correct_picks_count: scoring.correct_picks_count,
      wrong_picks_count: scoring.wrong_picks_count,
      total_targets: scoring.total_targets,
      is_correct: scoring.is_correct,
      attempt_status: attemptStatus,
      duration_ms: durationMs,
    })
    .select('id')
    .single();
  if (aErr) throw aErr;
  const attemptId = attemptRow.id;

  // Aborted: nothing else.
  if (attemptStatus === 'aborted') {
    return { attemptId, masteryDeltas: [] };
  }

  // 2) Insert game_score row (completed OR timeout).
  const points = (attemptStatus === 'completed' && scoring.is_correct) ? 5 : 3;
  const { error: gsErr } = await supabase
    .from('game_score')
    .insert({
      student_id: studentId,
      game_id: gameId,
      attempt_id: attemptId,
      score: scoring.score,
      points,
    });
  if (gsErr) throw gsErr;

  // Roll these points into the weekly/monthly leaderboard. Best-effort —
  // a failure here shouldn't block the game UI.
  try {
    await supabase.rpc('recalculate_student_scores', { p_student_id: studentId });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wfComplete] recalculate_student_scores failed:', e);
  }

  // Timeout: no mastery update, no history.
  if (attemptStatus === 'timeout') {
    return { attemptId, masteryDeltas: [] };
  }

  // 3) Mastery update — one EWMA hop per correct pick, per trained skill.
  const levelId = refs.levels[level];
  const { data: weightRows, error: wErr } = await supabase
    .from('game_skill_weights')
    .select('skill_id, weight')
    .eq('game_id', gameId)
    .eq('level_id', levelId);
  if (wErr) throw wErr;

  // Map skill_id → skill_key for later.
  const skillKeyById = Object.fromEntries(
    Object.entries(refs.skills).map(([k, id]) => [id, k]),
  );

  const primarySkillId = refs.skills.vocabulary;
  const masteryDeltas = [];

  for (const { skill_id, weight } of weightRows ?? []) {
    // Read current mastery (upsert 0 if row absent).
    const { data: existing, error: rErr } = await supabase
      .from('student_skill_mastery')
      .select('mastery_pct, correct_count, attempt_count')
      .eq('student_id', studentId)
      .eq('skill_id', skill_id)
      .maybeSingle();
    if (rErr) throw rErr;

    let mastery = existing?.mastery_pct ?? 0;
    const oldValue = mastery;

    // Apply EWMA once per correct pick, sequentially.
    for (let i = 0; i < scoring.correct_picks_count; i += 1) {
      const next = mastery + Number(weight) * ALPHA * (100 - mastery);
      mastery = next;
    }
    const newValue = Math.max(0, Math.min(100, Math.round(mastery)));

    const correctIncrement = (skill_id === primarySkillId) ? scoring.correct_picks_count : 0;

    // Upsert student_skill_mastery.
    const { error: uErr } = await supabase
      .from('student_skill_mastery')
      .upsert({
        student_id: studentId,
        skill_id,
        mastery_pct: newValue,
        correct_count: (existing?.correct_count ?? 0) + correctIncrement,
        attempt_count: (existing?.attempt_count ?? 0) + 1,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'student_id,skill_id' });
    if (uErr) throw uErr;

    // History row.
    const { error: hErr } = await supabase
      .from('student_skill_mastery_history')
      .insert({
        student_id: studentId,
        skill_id,
        old_value: oldValue,
        new_value: newValue,
        delta: newValue - oldValue,
        attempt_id: attemptId,
        game_id: gameId,
        triggered_by: 'session_completion',
      });
    if (hErr) throw hErr;

    masteryDeltas.push({
      skill: skillKeyById[skill_id] ?? 'unknown',
      oldValue,
      newValue,
    });
  }

  return { attemptId, masteryDeltas };
}
