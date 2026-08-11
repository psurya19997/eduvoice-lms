import { useEffect, useState } from 'react';
import SentenceCanvas from './SentenceCanvas.jsx';

export default function SBOutcome({ session, placements, scoring, onNextNow, paused }) {
  const initialSeconds = scoring.is_correct ? 5 : 15;
  const [countdown, setCountdown] = useState(initialSeconds);
  const [isPaused, setIsPaused] = useState(paused);

  useEffect(() => {
    if (isPaused || paused) return;
    if (countdown <= 0) { onNextNow(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, isPaused, paused, onNextNow]);

  // Points shown here mirror what sbComplete writes to game_score per PRD §5.2:
  // completed + is_correct → +5, completed + NOT is_correct → +3, otherwise 0.
  const points = scoring.is_correct ? 5 : 3;

  let headline = 'Nice try 🌱';
  let headlineColor = 'text-amber-700';
  if (scoring.is_correct) {
    headline = 'Perfect! 🌟';
    headlineColor = 'text-emerald-700';
  } else if (scoring.score >= 50) {
    headline = 'Great try! 👏';
    headlineColor = 'text-indigo-700';
  }

  // Helper: turn a full-sentence word array into a display string with clean punct spacing.
  const sentenceToString = (words) =>
    (words || []).join(' ').replace(/ ([.,!?;:])/g, '$1');

  const validAnswers = Array.isArray(session.valid_sentences)
    ? session.valid_sentences.map(sentenceToString)
    : [];

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className={`text-[18px] font-black leading-tight ${headlineColor}`}>{headline}</div>
        {points > 0 && (
          <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2.5 py-1 shrink-0">
            <span className="text-[12px]">⚡</span>
            <span className="text-[12px] font-black text-amber-700">+{points}</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
        {/* Render their placed sentence colored by correct/incorrect */}
        <SentenceCanvas
          layout={session.layout}
          placements={placements}
          slotMarks={scoring.slotMarks}
          onUndo={() => {}} // read-only
          disabled={true}
        />

        {/* If wrong, show every valid answer per PRD §3.7 */}
        {!scoring.is_correct && validAnswers.length > 0 && (
          <div className="bg-sky-50 rounded-xl p-4 ring-1 ring-sky-200">
            <div className="text-[11px] font-black text-sky-800 uppercase tracking-wider mb-1">
              You could have said
            </div>
            <ul className="flex flex-col gap-1">
              {validAnswers.map((sent, i) => (
                <li key={i} className="text-[15px] font-extrabold text-sky-950">
                  {sent}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Voice bubble — placeholder for Phase 10; only shows if the session enables it */}
        {session.voice_bonus_enabled && (
          <div className="bg-pink-50 rounded-xl p-3 ring-1 ring-pink-200 flex items-center gap-3">
            <div className="text-2xl" aria-hidden="true">🎙️</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-black text-pink-900">
                {session.voice_prompt_text || 'Say the sentence out loud'}
              </div>
              <div className="text-[10.5px] font-semibold text-pink-700/80 mt-0.5">
                Optional · doesn't affect your score (wiring lands in Phase 10)
              </div>
            </div>
          </div>
        )}

        <div className="text-center text-[11px] font-bold text-slate-500 mt-2">
          Your mastery has been updated based on your score.
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 shrink-0">
        <button
          type="button"
          onClick={onNextNow}
          className="h-12 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[14px] font-black shadow-md active:scale-[0.98] transition"
        >
          Next now →
        </button>
        <button
          type="button"
          onClick={() => setIsPaused((p) => !p)}
          className={`h-12 px-3 rounded-2xl ring-1 text-[12px] font-extrabold tabular-nums active:scale-[0.98] transition ${
            isPaused
              ? 'bg-white ring-slate-200 text-slate-600'
              : 'bg-slate-100 ring-slate-200 text-slate-700'
          }`}
        >
          {isPaused ? 'Paused ▶' : `Auto ${countdown}s ⏸`}
        </button>
      </div>
    </>
  );
}
