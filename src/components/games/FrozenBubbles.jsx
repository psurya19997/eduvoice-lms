// Outcome view: read-only capsules at the positions handed off from the play
// phase's physics snapshot. No motion, no interaction, no long-press.

const STATE_CLASSES = {
  correct: 'bg-emerald-50 ring-emerald-400 text-emerald-800',
  wrong: 'bg-amber-50 ring-amber-300 text-amber-800',
  missed: 'bg-sky-50 ring-sky-300 text-sky-800 animate-pulse',
  idle: 'bg-white/70 ring-slate-200 text-slate-500',
};

export default function FrozenBubbles({ snapshot, states, words }) {
  const positions = snapshot?.positions ?? {};
  const height = snapshot?.height ?? 500;
  const width = snapshot?.width;
  return (
    <div
      className="relative rounded-2xl bg-gradient-to-b from-sky-50 to-indigo-50 ring-1 ring-slate-200 overflow-hidden"
      style={{ height, width: width ?? '100%' }}
    >
      {words.map((w) => {
        const pos = positions[w.word];
        if (!pos) return null;
        const state = states[w.word] ?? 'idle';
        const cls = STATE_CLASSES[state] ?? STATE_CLASSES.idle;
        return (
          <div
            key={w.word}
            className={`absolute top-0 left-0 rounded-full ring-2 shadow-sm flex items-center justify-center gap-1.5 px-3 ${cls}`}
            style={{
              width: pos.w,
              height: pos.h,
              transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
            }}
          >
            <span className="text-[22px] leading-none">{w.emoji ?? '❔'}</span>
            <span className="text-[12px] font-extrabold whitespace-nowrap">{w.word}</span>
            {state === 'correct' && (
              <span className="absolute -top-2 -right-1 text-emerald-600 text-lg">✓</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
