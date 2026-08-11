import { useMemo } from 'react';
import ChipTile from './ChipTile.jsx';

// Simple Fisher-Yates shuffle that runs once when tiles change.
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function TileBank({ tiles, placements, onPlace, disabled }) {
  // Shuffle exactly once per unique set of tiles.
  // `tiles` may arrive as a flat array OR as { targets: [...], distractors: [...] }
  // per PRD §2 schema. Accept both.
  const shuffledBank = useMemo(() => {
    const flat = Array.isArray(tiles)
      ? tiles
      : [...(tiles?.targets ?? []), ...(tiles?.distractors ?? [])];
    const withIds = flat.map((t, idx) => ({ id: `${t}-${idx}`, text: t }));
    return shuffleArray(withIds);
  }, [tiles]);

  // Figure out which specific bank tiles are currently on the board.
  // We do this by consuming them left-to-right.
  const placedIds = new Set();
  const placementCounts = {};
  for (const p of placements) {
    if (p) {
      placementCounts[p] = (placementCounts[p] || 0) + 1;
    }
  }

  // Iterate over shuffled bank and "consume" the counts
  for (const bankTile of shuffledBank) {
    if (placementCounts[bankTile.text] > 0) {
      placedIds.add(bankTile.id);
      placementCounts[bankTile.text] -= 1;
    }
  }

  return (
    <div className="bg-slate-200/50 rounded-2xl p-4 flex flex-wrap gap-2.5 justify-center min-h-[120px] content-start">
      {shuffledBank.map((bankTile) => {
        const isPlaced = placedIds.has(bankTile.id);
        return (
          <ChipTile
            key={bankTile.id}
            text={bankTile.text}
            isPlaced={isPlaced}
            isSlot={false}
            disabled={disabled || isPlaced}
            onClick={() => {
              if (!isPlaced && !disabled) {
                onPlace(bankTile.text);
              }
            }}
          />
        );
      })}
    </div>
  );
}
