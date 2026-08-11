// useSTAudio — connects a raw <audio ref> to the sentence-highlighting model.
// The parent component owns the <audio> element and its src. This hook:
//   - Subscribes to timeupdate/ended/error events on the ref.
//   - Derives which sentence should be highlighted based on start_ms/end_ms.
//   - Retries load failures up to twice before surfacing an error to the UI.
//   - Resets its internal state whenever the sentences array identity changes
//     (i.e. paragraph advanced or language swapped).

import { useEffect, useRef, useState, useCallback } from 'react';

const LOAD_RETRIES = 2;
const RETRY_DELAY_MS = [1000, 3000];  // backoff between retries

export function useSTAudio({ audioRef, sentences, onEnd, onError }) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [hasEnded, setHasEnded]       = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [error, setError]             = useState(null);   // 'load_failed' | null

  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);

  // Reset whenever the sentence set changes (new paragraph OR language swap).
  useEffect(() => {
    setActiveIndex(-1);
    setHasEnded(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    retryCountRef.current = 0;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [sentences]);

  // Audio element event wiring.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => {
      const t = el.currentTime * 1000;
      setCurrentTime(t);
      // Find the sentence whose [start_ms, end_ms) contains current time.
      // Sentences are ordered so a simple scan is fine (5-10 items).
      let idx = -1;
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i];
        if (t >= s.start_ms && t < s.end_ms) { idx = i; break; }
      }
      // After the last sentence ends but before 'ended' fires, keep the last
      // sentence highlighted for continuity.
      if (idx === -1 && sentences.length > 0 && t >= sentences[sentences.length - 1].start_ms) {
        idx = sentences.length - 1;
      }
      setActiveIndex(idx);
    };

    const onPlay   = () => setIsPlaying(true);
    const onPause  = () => setIsPlaying(false);
    const onEnded  = () => {
      setIsPlaying(false);
      setHasEnded(true);
      onEnd?.();
    };
    const onLoaded = () => setDuration((el.duration || 0) * 1000);
    const onErrorEvt = () => {
      // Auto-retry with backoff before surfacing to the UI.
      if (retryCountRef.current < LOAD_RETRIES) {
        const delay = RETRY_DELAY_MS[retryCountRef.current] ?? 3000;
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => {
          try { el.load(); el.play().catch(() => {}); } catch { /* ignore */ }
        }, delay);
      } else {
        setError('load_failed');
        onError?.('load_failed');
      }
    };

    el.addEventListener('timeupdate',     onTime);
    el.addEventListener('play',           onPlay);
    el.addEventListener('pause',          onPause);
    el.addEventListener('ended',          onEnded);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('error',          onErrorEvt);

    return () => {
      el.removeEventListener('timeupdate',     onTime);
      el.removeEventListener('play',           onPlay);
      el.removeEventListener('pause',          onPause);
      el.removeEventListener('ended',          onEnded);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('error',          onErrorEvt);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [audioRef, sentences, onEnd, onError]);

  const play = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.play().catch(() => { /* browser blocks autoplay; user tap will retry */ });
  }, [audioRef]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, [audioRef]);

  const restart = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    setHasEnded(false);
    el.play().catch(() => {});
  }, [audioRef]);

  const manualRetry = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setError(null);
    retryCountRef.current = 0;
    try { el.load(); el.play().catch(() => {}); } catch { /* ignore */ }
  }, [audioRef]);

  return {
    activeIndex, isPlaying, hasEnded, currentTime, duration, error,
    play, pause, restart, manualRetry,
  };
}
