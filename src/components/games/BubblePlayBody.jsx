// Play-phase UI for Word Family bubble mode. Same props/contract as PlayBody.
// Exposes freezeAll() and snapshot() to the parent via useImperativeHandle for
// the Done handoff (see 08-word-family-bubble-mode.md).

import {
  forwardRef, useCallback, useEffect, useImperativeHandle,
  useMemo, useRef, useState,
} from 'react';
import { useBubblePhysics, BUBBLE_POP_ANIM_MS } from './useBubblePhysics.js';

const LONG_PRESS_MS = 400;
const DRAG_THRESHOLD = 8;
const HINT_DURATION_MS = 1800;
const BUBBLE_HEIGHT = 56;
const CANVAS_FONT = '800 12px "Nunito", system-ui, sans-serif';

const BubblePlayBody = forwardRef(function BubblePlayBody(
  { session, targetCount, picks, onToggle, onDone, submitting, onOpenHint },
  ref,
) {
  const containerRef = useRef(null);
  const nodeMapRef = useRef(new Map());
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [fontsReady, setFontsReady] = useState(
    () => !(typeof document !== 'undefined' && document.fonts && document.fonts.ready),
  );
  const [bubbleSize, setBubbleSize] = useState({ width: 96, height: BUBBLE_HEIGHT });
  const [hintWord, setHintWord] = useState(null);
  const [popping, setPopping] = useState(() => new Set());
  const gestureRef = useRef(null);

  // Wait for real fonts before measuring — 800 weight width is materially
  // wider than 400.
  useEffect(() => {
    if (fontsReady) return;
    let cancelled = false;
    document.fonts.ready.then(() => { if (!cancelled) setFontsReady(true); });
    return () => { cancelled = true; };
  }, [fontsReady]);

  // ResizeObserver — never hardcode dimensions.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setBounds((prev) =>
          prev.width === cr.width && prev.height === cr.height
            ? prev : { width: cr.width, height: cr.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Single fixed capsule width per session, sized for the longest word.
  useEffect(() => {
    if (!fontsReady || bounds.width === 0) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = CANVAS_FONT;
    let maxTextW = 0;
    for (const w of session.words) {
      const m = ctx.measureText(w.word);
      if (m.width > maxTextW) maxTextW = m.width;
    }
    const emojiSlot = 28;
    const gap = 6;
    const paddingSides = 24;
    const raw = Math.ceil(maxTextW + emojiSlot + gap + paddingSides);
    const cap = Math.max(120, bounds.width - 40);
    const width = Math.min(raw, cap);
    if (raw > cap) {
      // eslint-disable-next-line no-console
      console.warn('[BubblePlayBody] widest word exceeds container cap; consider shorter curriculum items.');
    }
    setBubbleSize((prev) =>
      prev.width === width && prev.height === BUBBLE_HEIGHT
        ? prev : { width, height: BUBBLE_HEIGHT });
  }, [fontsReady, session.words, bounds.width]);

  const physics = useBubblePhysics({
    words: session.words,
    bounds,
    nodeMap: nodeMapRef,
    bubbleSize,
  });

  useImperativeHandle(ref, () => ({
    freezeAll: () => physics.freezeAll(),
    snapshot: () => physics.snapshot(),
  }), [physics]);

  useEffect(() => {
    if (!hintWord) return;
    const t = setTimeout(() => setHintWord(null), HINT_DURATION_MS);
    return () => clearTimeout(t);
  }, [hintWord]);

  // Bubble list: words not currently picked, plus words that are picked but
  // still mid-pop-animation.
  const bubbleWords = useMemo(() => {
    const pickSet = new Set(picks);
    return session.words.filter((w) => !pickSet.has(w.word) || popping.has(w.word));
  }, [session.words, picks, popping]);

  const wordMap = useMemo(() => {
    const m = new Map();
    for (const w of session.words) m.set(w.word, w);
    return m;
  }, [session.words]);

  const startGesture = useCallback((word, e) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    physics.freeze(word);
    const timer = setTimeout(() => {
      const g = gestureRef.current;
      if (g && g.word === word && !g.dragged) {
        g.longPressed = true;
        setHintWord(word);
      }
    }, LONG_PRESS_MS);
    gestureRef.current = {
      word,
      startX: e.clientX,
      startY: e.clientY,
      longPressTimer: timer,
      dragged: false,
      longPressed: false,
      pointerId: e.pointerId,
    };
  }, [physics]);

  const moveGesture = useCallback((e) => {
    const g = gestureRef.current;
    if (!g || g.dragged) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
      g.dragged = true;
      clearTimeout(g.longPressTimer);
    }
  }, []);

  const endGesture = useCallback((e) => {
    const g = gestureRef.current;
    if (!g) return;
    clearTimeout(g.longPressTimer);
    try { e.currentTarget.releasePointerCapture(g.pointerId); } catch { /* ignore */ }
    const { word, dragged, longPressed } = g;
    gestureRef.current = null;
    if (dragged || longPressed) {
      physics.unfreeze(word);
      return;
    }
    // Pop: physics animates the node down; component keeps it rendered until
    // the animation completes, then removes it from the bubble list.
    physics.pop(word);
    setPopping((prev) => {
      const next = new Set(prev);
      next.add(word);
      return next;
    });
    onToggle(word);
    setTimeout(() => {
      setPopping((prev) => {
        if (!prev.has(word)) return prev;
        const next = new Set(prev);
        next.delete(word);
        return next;
      });
    }, BUBBLE_POP_ANIM_MS + 20);
  }, [physics, onToggle]);

  const cancelGesture = useCallback((e) => {
    const g = gestureRef.current;
    if (!g) return;
    clearTimeout(g.longPressTimer);
    try { e.currentTarget.releasePointerCapture(g.pointerId); } catch { /* ignore */ }
    physics.unfreeze(g.word);
    gestureRef.current = null;
  }, [physics]);

  const handleChipTap = useCallback((word) => {
    onToggle(word);
    // Defer addBubble until after React commits the new bubble node so
    // ref-callback registration is ready when physics starts writing.
    requestAnimationFrame(() => physics.addBubble(word));
  }, [onToggle, physics]);

  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold text-slate-900 leading-tight">
            {session.category_name}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[13px] font-extrabold text-slate-500 uppercase tracking-wide">
              Find {targetCount} words
            </span>
            <div className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[13px] font-black ring-1 ring-indigo-200">
              {picks.length} / {targetCount} Picked
            </div>
          </div>
        </div>
        {session.hint && (
          <button
            type="button"
            onClick={onOpenHint}
            className="shrink-0 w-8 h-8 rounded-full bg-amber-50 ring-1 ring-amber-200 text-amber-700 text-[13px] font-black active:scale-[0.95] transition"
            aria-label="Hint"
          >?</button>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 rounded-2xl bg-gradient-to-b from-sky-50 to-indigo-50 ring-1 ring-slate-200 overflow-hidden select-none"
        style={{ touchAction: 'none' }}
      >
        {bubbleWords.map((w) => {
          const isPopping = popping.has(w.word);
          return (
            <div
              key={w.word}
              ref={(el) => {
                if (el) nodeMapRef.current.set(w.word, el);
                else nodeMapRef.current.delete(w.word);
              }}
              onPointerDown={isPopping ? undefined : (e) => startGesture(w.word, e)}
              onPointerMove={isPopping ? undefined : moveGesture}
              onPointerUp={isPopping ? undefined : endGesture}
              onPointerCancel={isPopping ? undefined : cancelGesture}
              onContextMenu={(e) => e.preventDefault()}
              className={`absolute top-0 left-0 rounded-full ring-2 bg-white ring-slate-300 shadow-sm flex items-center justify-center gap-1.5 px-3 will-change-transform ${isPopping ? 'pointer-events-none' : 'touch-none'}`}
              style={{
                width: bubbleSize.width,
                height: bubbleSize.height,
                opacity: 0,
              }}
            >
              <span className="text-[22px] leading-none pointer-events-none">
                {w.emoji ?? '❔'}
              </span>
              <span className="text-[12px] font-extrabold text-slate-800 whitespace-nowrap pointer-events-none">
                {w.word}
              </span>
              {hintWord === w.word && w.l1_hindi && (
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-10 bg-slate-900 text-white text-[12px] font-bold rounded-lg px-2.5 py-1 shadow-lg whitespace-nowrap pointer-events-none">
                  {w.l1_hindi}
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-slate-900 rotate-45" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 h-14 rounded-2xl bg-slate-100 ring-1 ring-slate-200 px-2 flex items-center overflow-hidden shrink-0">
        {picks.length === 0 ? (
          <div className="w-full text-center text-[11px] font-bold text-slate-400">
            Tap bubbles to pick them
          </div>
        ) : (
          <div className="flex flex-nowrap gap-1.5 overflow-x-auto w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {picks.map((word) => {
              const w = wordMap.get(word);
              return (
                <button
                  key={word}
                  type="button"
                  onClick={() => handleChipTap(word)}
                  className="shrink-0 inline-flex items-center gap-1 h-9 rounded-full bg-white ring-1 ring-indigo-300 px-2.5 text-indigo-800 active:scale-[0.97] transition"
                >
                  <span className="text-[16px] leading-none">{w?.emoji ?? '❔'}</span>
                  <span className="text-[12px] font-extrabold whitespace-nowrap">{word}</span>
                  <span className="text-[10px] text-slate-400">✕</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onDone}
        disabled={submitting || picks.length === 0}
        className="mt-3 w-full h-13 min-h-[52px] rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[15px] font-black shadow-md active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100 shrink-0"
      >
        {submitting ? 'Checking…' : 'Done'}
      </button>
    </>
  );
});

export default BubblePlayBody;
