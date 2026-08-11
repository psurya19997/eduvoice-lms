// Pure scoring for Sentence Builder sessions. No React, no DB.
// See docs/games/06-sentence-builder.md §3.3 (overlap matching rules) and §5.1 (score formula).

/**
 * @typedef {{ type: 'locked', word: string } | { type: 'slot', id?: string } | { type: 'punct', word: string }} LayoutCell
 *
 * @param {(string|null)[]} placedTiles
 *   One entry per open slot (in slot order, left-to-right through the layout).
 *   `null` means the child left that slot empty.
 * @param {LayoutCell[]} layout
 *   Full layout array from the session (locked words + slots + punctuation).
 * @param {string[][]} validSentences
 *   Array of full canonical valid sentences (each is a word array, matching layout length).
 * @returns {{
 *   score: number,
 *   is_correct: boolean,
 *   correct_placements_count: number,
 *   wrong_placements_count: number,
 *   total_slots: number,
 *   canonicalValid: string[],
 *   slotMarks: ('green'|'red'|'empty')[]
 * }}
 */
export function sbScoring(placedTiles, layout, validSentences) {
  const totalSlots = placedTiles.length;

  // Reconstruct the child's full sentence: locked/punct fill their positions,
  // slot positions take from placedTiles in slot order.
  let cursor = 0;
  const childSentence = layout.map((cell) => {
    if (cell.type === 'locked' || cell.type === 'punct') return cell.word;
    const val = placedTiles[cursor] ?? null;
    cursor += 1;
    return val;
  });

  // Guard: empty placement or no valid sentences → everything empty, score 0.
  const hasAny = placedTiles.some((t) => t !== null && t !== undefined);
  if (!hasAny || totalSlots === 0 || validSentences.length === 0) {
    return {
      score: 0,
      is_correct: false,
      correct_placements_count: 0,
      wrong_placements_count: totalSlots,
      total_slots: totalSlots,
      canonicalValid: validSentences[0] ?? [],
      slotMarks: placedTiles.map(() => 'empty'),
    };
  }

  // Same-length preference: filter to valids matching child sentence length.
  // Fall back to all valids if none match (rare — happens if kid submitted incomplete).
  const sameLen = validSentences.filter((v) => v.length === childSentence.length);
  const candidates = sameLen.length > 0 ? sameLen : validSentences;

  // Score each candidate by slot overlap. Locked positions always match trivially,
  // so they're ignored; only slot positions count toward overlap.
  let bestOverlap = -1;
  let canonicalValid = candidates[0];
  for (const cand of candidates) {
    let overlap = 0;
    let slotIdx = 0;
    for (let i = 0; i < layout.length; i += 1) {
      if (layout[i].type !== 'slot') continue;
      const placed = placedTiles[slotIdx];
      slotIdx += 1;
      if (placed != null && cand[i] === placed) overlap += 1;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      canonicalValid = cand;
    }
    // Tie: keep the earlier entry (array order wins — do NOT update on equal).
  }

  // Mark each slot green / red / empty against the chosen canonical.
  const slotMarks = [];
  let correct = 0;
  let wrong = 0;
  let slotIdx = 0;
  for (let i = 0; i < layout.length; i += 1) {
    if (layout[i].type !== 'slot') continue;
    const placed = placedTiles[slotIdx];
    slotIdx += 1;
    if (placed == null) {
      slotMarks.push('empty');
      wrong += 1; // empty counts as wrong per §3.3
    } else if (canonicalValid[i] === placed) {
      slotMarks.push('green');
      correct += 1;
    } else {
      slotMarks.push('red');
      wrong += 1;
    }
  }

  const raw = ((correct - wrong) / totalSlots) * 100;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score,
    is_correct: score === 100,
    correct_placements_count: correct,
    wrong_placements_count: wrong,
    total_slots: totalSlots,
    canonicalValid,
    slotMarks,
  };
}
