// Responsive grid of tiles. Chooses 2 or 3 columns based on tile count.

import Tile from './Tile.jsx';

export default function TileGrid({ words, states, onToggle }) {
  const cols = words.length >= 6 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid ${cols} gap-3`}>
      {words.map((w) => (
        <Tile
          key={w.word}
          word={w}
          state={states[w.word] ?? 'idle'}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
