// A single tile: emoji (top) + word (bottom). Tap to select/deselect.
// Long-press (400ms) shows Hindi bubble.
//
// state: 'idle' | 'selected' | 'correct' | 'missed' | 'wrong'
//   idle: neutral card
//   selected: blue border, no reveal
//   correct: green + ✓
//   missed:  blue pulse + "was correct"
//   wrong:   soft amber (never red)

import { useRef, useState, useEffect } from 'react';

const LONG_PRESS_MS = 400;

export default function Tile({ word, state = 'idle', onToggle }) {
  const [showHindi, setShowHindi] = useState(false);
  const timerRef = useRef(null);
  const longPressedRef = useRef(false);

  useEffect(() => {
    if (!showHindi) return;
    const t = setTimeout(() => setShowHindi(false), 1800);
    return () => clearTimeout(t);
  }, [showHindi]);

  const startPress = () => {
    longPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      setShowHindi(true);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const handleClick = (e) => {
    e.preventDefault();
    if (longPressedRef.current) return; // swallow the click that followed a long press
    if (state === 'idle' || state === 'selected') onToggle?.(word.word);
  };

  const revealed = state === 'correct' || state === 'missed' || state === 'wrong';

  const stateClasses = {
    idle:     'bg-white ring-slate-200 text-slate-800 hover:ring-slate-300',
    selected: 'bg-indigo-50 ring-indigo-400 text-indigo-800 shadow-sm',
    correct:  'bg-emerald-50 ring-emerald-400 text-emerald-800',
    missed:   'bg-sky-50 ring-sky-300 text-sky-800 animate-pulse',
    wrong:    'bg-amber-50 ring-amber-300 text-amber-800',
  }[state];

  return (
    <button
      type="button"
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onContextMenu={(e) => e.preventDefault()}
      onClick={handleClick}
      disabled={revealed}
      className={`
        relative min-h-[76px] py-2 px-1 rounded-2xl ring-2 ${stateClasses}
        flex flex-col items-center justify-center gap-1
        transition active:scale-[0.97]
        select-none
      `}
    >
      <div className="text-[32px] leading-none">
        {word.emoji ?? '❔'}
      </div>
      <div className="text-[12px] font-extrabold text-center break-words px-1">
        {word.word}
      </div>

      {state === 'correct' && (
        <span className="absolute top-1.5 right-1.5 text-emerald-600 text-lg">✓</span>
      )}
      {state === 'missed' && (
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-extrabold bg-sky-500 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">
          was correct
        </span>
      )}

      {showHindi && word.l1_hindi && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-10 bg-slate-900 text-white text-[12px] font-bold rounded-lg px-2.5 py-1 shadow-lg whitespace-nowrap animate-[fadeIn_.15s_ease-out]">
          {word.l1_hindi}
          <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-slate-900 rotate-45" />
        </div>
      )}
    </button>
  );
}
