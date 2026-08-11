// useSTRecorder — MediaRecorder wrapper with duration cap and volume metering.
//
// State machine:
//   'idle'      → not started (initial + after reset)
//   'requesting' → asking for mic permission
//   'recording' → mic active, collecting chunks, timer running
//   'stopped'   → recording ended (either by user, by cap, or by error); blob is ready
//   'unsupported' → browser has no MediaRecorder / getUserMedia
//   'denied'    → user denied mic permission
//   'error'     → other capture failure
//
// The parent owns the "submit" decision; this hook only produces the blob.

import { useCallback, useEffect, useRef, useState } from 'react';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of MIME_CANDIDATES) {
    if (!m) return '';                                    // browser default
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

export function useSTRecorder({ maxDurationMs }) {
  const [state, setState] = useState(() => {
    if (typeof navigator === 'undefined') return 'idle';
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return 'unsupported';
    }
    return 'idle';
  });
  const [blob, setBlob]           = useState(null);
  const [mimeType, setMimeType]   = useState(null);
  const [durationMs, setDuration] = useState(0);
  const [level, setLevel]         = useState(0);          // 0..1 instantaneous volume
  const [error, setError]         = useState(null);

  const streamRef       = useRef(null);
  const recorderRef     = useRef(null);
  const chunksRef       = useRef([]);
  const startTsRef      = useRef(0);
  const durationTimerRef= useRef(null);
  const capTimerRef     = useRef(null);
  const audioCtxRef     = useRef(null);
  const analyserRef     = useRef(null);
  const rafRef          = useRef(0);

  // Clean shutdown — release mic, stop timers, disconnect AudioContext.
  const cleanup = useCallback(() => {
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (capTimerRef.current)      { clearTimeout(capTimerRef.current);       capTimerRef.current = null; }
    if (rafRef.current)           { cancelAnimationFrame(rafRef.current);    rafRef.current = 0; }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    streamRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (state === 'unsupported') return;
    setError(null);
    setBlob(null);
    setDuration(0);
    chunksRef.current = [];
    setState('requesting');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const isDenied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      setState(isDenied ? 'denied' : 'error');
      setError(e?.message ?? 'mic-failed');
      return;
    }
    streamRef.current = stream;

    const mime = pickMime();
    setMimeType(mime || 'audio/webm');
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
    recorder.onstop = () => {
      const type = mime || 'audio/webm';
      const b = new Blob(chunksRef.current, { type });
      setBlob(b);
      setState('stopped');
      cleanup();
    };
    recorder.onerror = () => {
      setError('recorder-error');
      setState('error');
      cleanup();
    };

    // Volume meter — RMS-ish level for the visualiser.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length) / 255;
        setLevel(Math.min(1, rms * 2.2));                 // small gain — feels responsive
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* metering is optional */ }

    startTsRef.current = Date.now();
    durationTimerRef.current = setInterval(() => {
      setDuration(Date.now() - startTsRef.current);
    }, 100);

    if (maxDurationMs && maxDurationMs > 0) {
      capTimerRef.current = setTimeout(() => stop(), maxDurationMs);
    }

    setState('recording');
    recorder.start(250);                                  // 250ms chunk cadence
  }, [state, maxDurationMs, cleanup]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (r.state !== 'inactive') r.stop();                 // triggers onstop → cleanup
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setBlob(null);
    setDuration(0);
    setLevel(0);
    setError(null);
    setState('idle');
    chunksRef.current = [];
    recorderRef.current = null;
  }, [cleanup]);

  return { state, blob, mimeType, durationMs, level, error, start, stop, reset };
}
