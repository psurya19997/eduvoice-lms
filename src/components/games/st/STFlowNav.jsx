// Prev / Next chevrons for Story Teller session + practice pages.
// These are for WITHIN-STORY navigation only — the round BackButton next
// to them handles back-to-hub. So Prev disables at index 0 (no hub jump).
// Next is gated: enabled only when there is a strictly-earlier resumeIndex
// (i.e. the kid is reviewing an already-done node). At the current resume
// point, Next is disabled — forward-flow uses the existing "I understood" button.

import { useNavigate } from 'react-router-dom';

export default function STFlowNav({ currentIndex, resumeIndex, nodes, level, step, nodeToUrl }) {
  const navigate = useNavigate();

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < resumeIndex && currentIndex + 1 < nodes.length;

  const goPrev = () => {
    if (!canGoPrev) return;
    navigate(nodeToUrl(nodes[currentIndex - 1], { level, step }));
  };
  const goNext = () => {
    if (!canGoNext) return;
    navigate(nodeToUrl(nodes[currentIndex + 1], { level, step }));
  };

  const btnCls = (enabled) => `w-8 h-8 rounded-lg transition flex items-center justify-center ${
    enabled
      ? 'text-slate-600 hover:bg-slate-100 active:bg-slate-200'
      : 'text-slate-300 cursor-not-allowed'
  }`;

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button type="button" onClick={goPrev} disabled={!canGoPrev} aria-label="Previous" className={btnCls(canGoPrev)}>
        <Chevron dir="left" />
      </button>
      <button type="button" onClick={goNext} disabled={!canGoNext} aria-label="Next" className={btnCls(canGoNext)}>
        <Chevron dir="right" />
      </button>
    </div>
  );
}

function Chevron({ dir }) {
  const d = dir === 'left'
    ? 'M15 18l-6-6 6-6'
    : 'M9 6l6 6-6 6';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
