// Horizontal mastery bar 0-100. Two modes:
//   - Static: pass `value` (no animation).
//   - Animated: pass `from` and `to` (animates on mount).
// `compact` renders a thin bar with an inline label prefix — used in the header strip.

import { useEffect, useState } from 'react';

export default function MasteryBar({
  label,
  from,
  to,
  value,
  compact = false,
  accent = 'from-indigo-500 to-violet-600',
}) {
  const start = from ?? value ?? 0;
  const end = to ?? value ?? 0;
  const [pct, setPct] = useState(start);

  useEffect(() => {
    if (from == null || to == null || from === to) {
      setPct(end);
      return;
    }
    const t = setTimeout(() => setPct(end), 60);
    return () => clearTimeout(t);
  }, [from, to, end]);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {label && (
          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide shrink-0">
            {label}
          </span>
        )}
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden min-w-[40px]">
          <div
            className={`h-full bg-gradient-to-r ${accent} transition-all duration-[1200ms] ease-out`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 text-[11px] font-extrabold text-slate-600 uppercase tracking-wide">
          {label}
        </div>
      )}
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden ring-1 ring-slate-200">
        <div
          className={`h-full bg-gradient-to-r ${accent} transition-all duration-[1200ms] ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
