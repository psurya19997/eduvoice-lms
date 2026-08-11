// STAudioRecorder — the recording UI a practice item uses.
//
// States (from useSTRecorder):
//   idle / requesting / recording / stopped / unsupported / denied / error
//
// UX:
//   - Big rose mic button in the middle.
//   - Volume-driven pulse ring while recording.
//   - Countdown chip showing time remaining (cap - elapsed).
//   - Auto-stop at cap.
//   - After stop: Re-record / Submit buttons.
//   - Denied / unsupported → falls back to a text-area with the same Submit contract.
//
// Parent contract:
//   props:
//     durationCapSeconds  int      — hard cap
//     onSubmit(payload)   fn       — { blob, mimeType, audioDurationMs, durationMs } for spoken,
//                                    { transcript, durationMs } for typed
//     submitting          bool     — parent grays out submit while POSTing
//     autoStart           bool     — start recording immediately on mount (optional)

import { useEffect, useRef, useState } from 'react';
import { useSTRecorder } from '../../../lib/games/useSTRecorder.js';

export default function STAudioRecorder({
  durationCapSeconds,
  onSubmit,
  submitting = false,
  autoStart = false,
}) {
  const maxMs = (durationCapSeconds || 60) * 1000;
  const rec = useSTRecorder({ maxDurationMs: maxMs });

  // Total time from prompt-shown → submit (tracked once, resets on re-record).
  const promptShownAtRef = useRef(Date.now());

  useEffect(() => {
    if (autoStart && rec.state === 'idle') rec.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const remainingSec = Math.max(0, Math.ceil((maxMs - rec.durationMs) / 1000));
  const elapsedSec   = Math.floor(rec.durationMs / 1000);

  const handleSubmit = () => {
    if (!rec.blob) return;
    onSubmit?.({
      blob: rec.blob,
      mimeType: rec.mimeType,
      audioDurationMs: rec.durationMs,
      durationMs: Date.now() - promptShownAtRef.current,
    });
  };

  const handleReRecord = () => {
    rec.reset();
    promptShownAtRef.current = Date.now();
  };

  // ---- Unsupported / Denied → typed fallback ----
  if (rec.state === 'unsupported' || rec.state === 'denied') {
    return (
      <TypedFallback
        reason={rec.state}
        submitting={submitting}
        onSubmit={(transcript) =>
          onSubmit?.({ transcript, durationMs: Date.now() - promptShownAtRef.current })
        }
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-3">
      {rec.state === 'recording' && (
        <div className="text-[13px] font-black tabular-nums text-rose-700">
          ⏺ {elapsedSec}s   ·   {remainingSec}s left
        </div>
      )}
      {rec.state === 'stopped' && (
        <div className="text-[13px] font-black tabular-nums text-emerald-700">
          ✓ Recorded {elapsedSec}s
        </div>
      )}

      <MicButton
        state={rec.state}
        level={rec.level}
        onStart={rec.start}
        onStop={rec.stop}
      />

      {rec.error && (
        <div className="text-[12px] font-semibold text-rose-600 text-center max-w-xs">
          {rec.error}
        </div>
      )}

      {rec.state === 'stopped' && (
        <div className="w-full max-w-xs flex flex-col gap-2 pt-2">
          <audio src={rec.blob ? URL.createObjectURL(rec.blob) : undefined} controls className="w-full" />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-12 rounded-2xl bg-emerald-600 text-white text-[15px] font-black shadow-md hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 active:scale-[0.98] transition"
          >
            {submitting ? 'Sending…' : '✓ Submit answer'}
          </button>
          <button
            type="button"
            onClick={handleReRecord}
            disabled={submitting}
            className="h-11 rounded-2xl bg-slate-50 text-slate-700 ring-1 ring-slate-200 text-[14px] font-extrabold active:scale-[0.98] transition"
          >
            🔄 Record again
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- mic button with volume-driven ring ---------------- */

function MicButton({ state, level, onStart, onStop }) {
  const isRecording = state === 'recording';
  const isRequesting = state === 'requesting';
  const showBigMic = state === 'idle' || state === 'requesting';

  // Ring scale reacts to input level (1.0 → 1.5).
  const ringScale = 1 + Math.min(0.5, level * 0.5);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      {isRecording && (
        <span
          className="absolute rounded-full bg-rose-500/25 transition-transform duration-100"
          style={{
            width: 120, height: 120,
            transform: `scale(${ringScale})`,
          }}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        onClick={isRecording ? onStop : onStart}
        disabled={isRequesting}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        className={`
          relative w-24 h-24 rounded-full text-white flex items-center justify-center
          shadow-lg active:scale-95 transition
          ${isRecording ? 'bg-rose-700' : 'bg-rose-600 hover:bg-rose-700'}
          ${isRequesting ? 'opacity-70' : ''}
        `}
      >
        {showBigMic ? <MicIcon size={40} /> : <StopIcon size={32} />}
      </button>
    </div>
  );
}

/* ---------------- typed fallback ---------------- */

function TypedFallback({ reason, submitting, onSubmit }) {
  const [text, setText] = useState('');
  const helper = reason === 'unsupported'
    ? "Your browser can't record audio. Type your answer here instead."
    : "Mic access is off. Type your answer here — same scoring.";
  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="text-[12px] font-semibold text-slate-500 text-center">{helper}</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Type your answer…"
        className="w-full rounded-2xl border border-slate-200 p-3 text-[15px] font-medium text-slate-800 focus:border-rose-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => text.trim() && onSubmit?.(text.trim())}
        disabled={submitting || !text.trim()}
        className="h-12 rounded-2xl bg-emerald-600 text-white text-[15px] font-black shadow-md hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 active:scale-[0.98] transition"
      >
        {submitting ? 'Sending…' : '✓ Submit typed answer'}
      </button>
    </div>
  );
}

/* ---------------- icons ---------------- */

function MicIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a1 1 0 0 1 2 0 7 7 0 0 1-6 6.92V21h3a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2h3v-2.08A7 7 0 0 1 5 12a1 1 0 0 1 2 0 5 5 0 0 0 10 0z"/>
    </svg>
  );
}
function StopIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
