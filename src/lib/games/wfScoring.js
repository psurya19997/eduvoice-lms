// Pure scoring for Word Family sessions. No React, no DB.
// See docs/games/05-word-family.md for the score formula.

/**
 * @param {string[]} picks    words the kid tapped
 * @param {Array<{word:string,is_target:boolean}>} words  the session's tile array
 * @returns {{
 *   score: number,           // 0-100, clamped
 *   is_correct: boolean,     // WF strict: score === 100
 *   correct_picks_count: number,
 *   wrong_picks_count: number,
 *   total_targets: number,
 * }}
 */
export function wfScoring(picks, words) {
  const targetSet = new Set(words.filter((w) => w.is_target).map((w) => w.word));
  const pickSet = new Set(picks);
  let correct = 0;
  let wrong = 0;
  for (const p of pickSet) {
    if (targetSet.has(p)) correct += 1;
    else wrong += 1;
  }
  const total = targetSet.size;
  const raw = ((correct - wrong) / total) * 100;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return {
    score,
    is_correct: score === 100,
    correct_picks_count: correct,
    wrong_picks_count: wrong,
    total_targets: total,
  };
}
