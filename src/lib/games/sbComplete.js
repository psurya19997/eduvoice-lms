// Writes all consequences of finishing a Sentence Builder session:
//   sentence_builder_attempts (always)
//   game_score           (if score > 0 and completed)
//   student_skill_mastery + history  (if completed and score > 0)
//
// See docs/games/06-sentence-builder.md §5 for scoring and mastery rules.

import { supabase } from '../supabase.js';
import { getRefs } from './wfRefs.js';

const ALPHA = 0.15; // EWMA learning rate

/**
 * @param {{
 *   studentId: string,
 *   sessionId: string,
 *   level: 'alpha'|'beta'|'gamma',
 *   placedTiles: (string|null)[],
 *   scoring: { score:number, is_correct:boolean, correct_placements_count:number, wrong_placements_count:number },
 *   durationMs: number,
 *   attemptStatus: 'completed'|'timeout'|'aborted',
 *   voiceAudioUrl?: string,
 *   hintsUsed?: any
 * }} args
 * @returns {Promise<{ attemptId: string, masteryDeltas: Array<{skill:string, oldValue:number, newValue:number}> }>}
 */
export async function sbComplete(args) {
  const {
    studentId, sessionId, level, placedTiles, scoring, durationMs, attemptStatus, voiceAudioUrl, hintsUsed
  } = args;

  const refs = await getRefs();
  const gameId = refs.games.sentence_builder;

  // 1) Always insert an attempt row.
  const { data: attemptRow, error: aErr } = await supabase
    .from('sentence_builder_attempts')
    .insert({
      student_id: studentId,
      session_id: sessionId,
      placed_tiles: placedTiles || [],
      correct_placements_count: scoring.correct_placements_count,
      wrong_placements_count: scoring.wrong_placements_count,
      score: scoring.score,
      is_correct: scoring.is_correct,
      attempt_status: attemptStatus,
      duration_ms: durationMs,
      voice_audio_url: voiceAudioUrl || null,
      hints_used: hintsUsed || {}
    })
    .select('id')
    .single();
  if (aErr) throw aErr;
  const attemptId = attemptRow.id;

  // Aborted: nothing else.
  if (attemptStatus === 'aborted') {
    return { attemptId, masteryDeltas: [] };
  }

  // 2) Insert game_score row per PRD §5.2:
  //    completed + is_correct → +5
  //    completed + NOT is_correct → +3
  //    timeout → +3
  //    aborted → no row (already returned above)
  // game_score.points is CHECK-constrained to (3, 5) at the DB — never write anything else.
  let points = 0;
  if (attemptStatus === 'completed') {
    points = scoring.is_correct ? 5 : 3;
  } else if (attemptStatus === 'timeout') {
    points = 3;
  }

  if (points > 0) {
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
  }

  // Roll these points into the weekly/monthly leaderboard.
  try {
    await supabase.rpc('recalculate_student_scores', { p_student_id: studentId });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[sbComplete] recalculate_student_scores failed:', e);
  }

  // Mastery updates only on completed attempts per PRD §5.3
  // (aborted returned above; timeout writes game_score but skips mastery).
  if (attemptStatus !== 'completed') {
    return { attemptId, masteryDeltas: [] };
  }

  // 3) Mastery update — single EWMA hop scaled by score/100, per trained skill.
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

  const masteryDeltas = [];

  for (const { skill_id, weight } of weightRows ?? []) {
    // Read current mastery
    const { data: existing, error: rErr } = await supabase
      .from('student_skill_mastery')
      .select('mastery_pct, correct_count, attempt_count')
      .eq('student_id', studentId)
      .eq('skill_id', skill_id)
      .maybeSingle();
    if (rErr) throw rErr;

    const mastery = existing?.mastery_pct ?? 0;
    const oldValue = mastery;

    // Single hop scaled by score (PRD §5.3)
    const scale = scoring.score / 100;
    const next = mastery + Number(weight) * ALPHA * (100 - mastery) * scale;
    const newValue = Math.max(0, Math.min(100, Math.round(next)));

    const isGrammar = skill_id === refs.skills.grammar;
    const correctIncrement = (isGrammar && scoring.is_correct) ? 1 : 0;

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
