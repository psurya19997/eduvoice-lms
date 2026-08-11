// Shared bottom-sheet hint UI. Used by both Sentence Builder and Word Family.
// - Non-progressive mode (WF): shows all hints at once.
// - Progressive mode (SB): reveals hint_1 first, then a "Show another hint"
//   button reveals hint_2. Empty hints are filtered out.
// Renders nothing when there are no hints to show, or when open=false.

import { useEffect, useState } from 'react';

export default function HintSheet({ open, onClose, hints, progressive = false }) {
  const validHints = (hints || []).filter((h) => h && String(h).trim().length > 0);

  const [shown, setShown] = useState(1);

  // Reset how many hints are shown whenever the sheet opens.
  useEffect(() => {
    if (open) setShown(progressive ? 1 : validHints.length);
  }, [open, progressive, validHints.length]);

  if (!open || validHints.length === 0) return null;

  const canShowMore = progressive && shown < validHints.length;

  return (
    <div
      className="absolute inset-0 z-30 bg-slate-900/50 backdrop-blur-sm flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-3xl p-5 shadow-2xl max-h-[80%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-3" />

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-black text-slate-900 flex items-center gap-1.5">
            <span>💡</span>
            <span>{validHints.length === 1 ? 'Hint' : 'Hints'}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close hints"
            className="text-slate-400 text-xl font-black w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {validHints.slice(0, shown).map((h, i) => (
            <div
              key={i}
              className={`rounded-xl bg-amber-50 ring-1 ring-amber-200 px-3.5 py-2.5 text-[13.5px] font-semibold ${
                i === 0 ? 'text-amber-900' : 'text-amber-800'
              }`}
            >
              {h}
            </div>
          ))}
        </div>

        {canShowMore && (
          <button
            type="button"
            onClick={() => setShown((n) => Math.min(n + 1, validHints.length))}
            className="mt-4 w-full h-11 rounded-xl bg-amber-100 ring-1 ring-amber-200 text-amber-800 text-[12.5px] font-extrabold active:scale-[0.98] transition"
          >
            💡 Show another hint
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full h-11 rounded-xl bg-slate-100 text-slate-600 text-[12.5px] font-extrabold active:scale-[0.98] transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}
