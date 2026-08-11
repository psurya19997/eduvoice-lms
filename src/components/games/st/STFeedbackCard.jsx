// STFeedbackCard — shows Gemini's analysis of a practice attempt to the child.
//
// Handles all terminal / near-terminal attempt states:
//   'completed'          → celebratory card with score, notes, beats, counts, TTS
//   'submitted_pending'  → warm "listening to your answer…" loader
//   'no_speech'          → gentle "we couldn't hear you" retry state
//   'failed'             → apologetic "come back later" state
//
// TTS auto-plays once when we transition to 'completed'. There's a replay
// button and a mute toggle in case the child is in a shared space.

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchFeedbackAudio } from '../../../lib/games/stFeedbackTTS.js';

export default function STFeedbackCard({
  attempt,           // the DB row (or null while first fetch is in flight)
  itemBeats,         // [{id,text}, ...] from the parent item's content.beats
  onContinue,        // parent nav to the next thing (item, story-end, etc.)
  onRetry,           // parent hook to retry (used on no_speech / failed)
}) {
  const status = attempt?.attempt_status ?? 'submitted_pending';

  if (status === 'submitted_pending' || status === 'upload_pending') {
    return <PendingCard />;
  }
  if (status === 'failed') {
    return <FailedCard onRetry={onRetry} onContinue={onContinue} />;
  }
  if (status === 'no_speech') {
    return <NoSpeechCard onRetry={onRetry} />;
  }
  if (status === 'completed') {
    return <CompletedCard attempt={attempt} itemBeats={itemBeats} onContinue={onContinue} />;
  }
  return null;
}

/* ---------------- Completed ---------------- */

function CompletedCard({ attempt, itemBeats = [], onContinue }) {
  const score       = attempt.final_score ?? 0;
  const positive    = attempt.positive_note ?? '';
  const next        = attempt.next_step ?? '';
  const uniqEn      = attempt.unique_english ?? 0;
  const uniqHi      = attempt.unique_hindi ?? 0;
  const relevance   = attempt.relevance_band ?? 0;
  const coverage    = attempt.coverage_band ?? 0;
  const beatIds     = Array.isArray(attempt.beats_covered) ? attempt.beats_covered : [];

  // Auto-fetch + play TTS of "positive. next" once on mount / attempt change.
  const [muted, setMuted]         = useState(false);
  const [audioUrl, setAudioUrl]   = useState(null);
  const audioRef                  = useRef(null);
  const spokenText = useMemo(() => [positive, next].filter(Boolean).join(' '), [positive, next]);

  useEffect(() => {
    if (!spokenText) return;
    let revoke = null;
    (async () => {
      const u = await fetchFeedbackAudio(spokenText);
      if (!u) return;
      revoke = u;
      setAudioUrl(u);
      // Attempt autoplay (may be blocked without prior user gesture — that's fine).
      queueMicrotask(() => audioRef.current?.play().catch(() => {}));
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [spokenText]);

  const scoreColor  = score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-rose-600';
  const scoreRing   = score >= 80 ? 'stroke-emerald-500' : score >= 50 ? 'stroke-amber-500' : 'stroke-rose-500';

  return (
    <div className="flex flex-col gap-4">
      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        muted={muted}
        onEnded={() => { /* nothing — one-shot */ }}
        className="hidden"
      />

      {/* Score ring */}
      <div className="flex flex-col items-center gap-1 pt-1">
        <ScoreRing score={score} colorClass={scoreRing} />
        <div className={`text-[13px] font-black uppercase tracking-wider ${scoreColor}`}>
          {score >= 80 ? 'Wonderful!' : score >= 50 ? 'Good job!' : 'Nice try'}
        </div>
      </div>

      {/* Coaching text */}
      {positive && (
        <div className="rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 p-3 flex items-start gap-2">
          <span className="text-[16px]" aria-hidden="true">🌟</span>
          <div className="text-[14px] font-semibold text-emerald-900 leading-snug">{positive}</div>
        </div>
      )}
      {next && (
        <div className="rounded-2xl bg-indigo-50 ring-1 ring-indigo-200 p-3 flex items-start gap-2">
          <span className="text-[16px]" aria-hidden="true">🎯</span>
          <div className="text-[14px] font-semibold text-indigo-900 leading-snug">{next}</div>
        </div>
      )}

      {/* Playback controls (only if TTS is available) */}
      {audioUrl && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => { const el = audioRef.current; if (el) { el.currentTime = 0; el.play().catch(() => {}); } }}
            className="h-9 px-4 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200 text-[12px] font-black active:scale-95 transition"
          >
            🔊 Play again
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="h-9 px-4 rounded-full bg-slate-50 text-slate-700 ring-1 ring-slate-200 text-[12px] font-black active:scale-95 transition"
          >
            {muted ? '🔇 Muted' : '🔈 Mute'}
          </button>
        </div>
      )}

      {/* Beats + word counts */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-3 flex flex-col gap-3">
        {itemBeats.length > 0 && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
              Things you covered  ({coverage} of {itemBeats.length})
            </div>
            <ul className="flex flex-col gap-1">
              {itemBeats.map((b) => {
                const hit = beatIds.includes(b.id);
                return (
                  <li key={b.id} className="flex items-start gap-2 text-[12px]">
                    <span className={hit ? 'text-emerald-600' : 'text-slate-300'} aria-hidden="true">
                      {hit ? '✓' : '○'}
                    </span>
                    <span className={hit ? 'text-slate-800 font-semibold' : 'text-slate-400'}>
                      {b.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 mt-1">
          <StatChip label="Words spoken" value={attempt.word_count_total ?? 0} />
          <StatChip label="English words" value={uniqEn} tone="indigo" />
          <StatChip label="Hindi words" value={uniqHi} tone="amber" />
          <StatChip label="On-topic" value={`${relevance}/3`} tone="rose" />
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="w-full h-12 rounded-2xl bg-emerald-600 text-white text-[15px] font-black shadow-md hover:bg-emerald-700 active:scale-[0.98] transition"
      >
        Continue →
      </button>
    </div>
  );
}

/* ---------------- Loading / retry states ---------------- */

function PendingCard() {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <svg className="animate-spin text-rose-600" width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="text-[14px] font-black text-slate-800">Listening to your answer…</div>
      <div className="text-[12px] font-semibold text-slate-500 text-center max-w-xs">
        This can take a few seconds. You can wait here or come back and see your score later.
      </div>
    </div>
  );
}

function NoSpeechCard({ onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="text-4xl">🐢</div>
      <div className="text-[14px] font-black text-slate-800">We couldn't hear you</div>
      <div className="text-[12px] font-semibold text-slate-500 text-center max-w-xs">
        Try again in a quiet spot. Hold your device a little closer to your mouth.
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 h-11 px-6 rounded-2xl bg-rose-600 text-white text-[14px] font-black shadow-md hover:bg-rose-700 active:scale-[0.98] transition"
      >
        🔄 Try again
      </button>
    </div>
  );
}

function FailedCard({ onRetry, onContinue }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="text-4xl">🐢</div>
      <div className="text-[14px] font-black text-slate-800">Something went slow on our end</div>
      <div className="text-[12px] font-semibold text-slate-500 text-center max-w-xs">
        Your answer is saved. We'll try to score it again in a few minutes — come back to see how you did.
      </div>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onRetry}
          className="h-11 px-5 rounded-2xl bg-rose-50 text-rose-700 ring-1 ring-rose-200 text-[13px] font-black active:scale-[0.98] transition"
        >
          Try now
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="h-11 px-5 rounded-2xl bg-emerald-600 text-white text-[13px] font-black active:scale-[0.98] transition"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

/* ---------------- Bits ---------------- */

function ScoreRing({ score, colorClass }) {
  const size = 96;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius}
          stroke="rgb(226 232 240)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius}
          strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          className={colorClass}
          style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-[26px] font-black tabular-nums text-slate-900">{score}</div>
      </div>
    </div>
  );
}

function StatChip({ label, value, tone = 'slate' }) {
  const tones = {
    slate:  'bg-slate-100 text-slate-700',
    indigo: 'bg-indigo-50 text-indigo-800',
    amber:  'bg-amber-50 text-amber-800',
    rose:   'bg-rose-50 text-rose-800',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black tabular-nums ${tones[tone] ?? tones.slate}`}>
      <span className="font-black">{value}</span>
      <span className="font-semibold opacity-70">{label}</span>
    </span>
  );
}
