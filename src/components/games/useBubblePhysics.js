// Headless physics for the bubble play area.
// - Bodies live in bodiesRef (Map<word, Body>) and never trigger React re-renders.
// - RAF loop integrates positions and writes transforms directly to DOM nodes
//   registered in nodeMap (Ref<Map<word, HTMLElement>>).
// - Popped bodies stay in the map with their frozen position so snapshot() can
//   return them for the outcome view; they are skipped by integration and
//   collision entirely (see 08-word-family-bubble-mode.md).

import { useCallback, useEffect, useRef } from 'react';

const SUBSTEPS = 2;
const CONSTRAINT_ITERS = 3;
const BASE_SPEED = 130; // px/s — bubbles must feel lively, not sedate
const SEPARATION_ITERS = 24;
const POP_ANIM_MS = 320;

export function useBubblePhysics({ words, bounds, nodeMap, bubbleSize }) {
  const bodiesRef = useRef(null);
  if (bodiesRef.current === null) bodiesRef.current = new Map();

  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const sizeRef = useRef(bubbleSize);
  sizeRef.current = bubbleSize;

  // Idempotent seed — only creates bodies that don't exist yet.
  // Runs on mount, after resize, and when bubbleSize changes.
  useEffect(() => {
    const map = bodiesRef.current;
    const { width: W, height: H } = bounds;
    if (W === 0 || H === 0) return;
    const { width: bw, height: bh } = bubbleSize;
    const halfLen = Math.max(0, (bw - bh) / 2);
    const r = bh / 2;

    // Update existing bodies' capsule dimensions and clamp positions.
    for (const b of map.values()) {
      b.halfLen = halfLen;
      b.r = r;
      const minX = halfLen + r;
      const maxX = W - halfLen - r;
      const minY = r;
      const maxY = H - r;
      if (b.x < minX) b.x = minX;
      if (b.x > maxX) b.x = maxX;
      if (b.y < minY) b.y = minY;
      if (b.y > maxY) b.y = maxY;
    }

    // Seed missing bodies with an initial grid + random velocity.
    const cols = Math.max(2, Math.ceil(Math.sqrt(words.length)));
    const rows = Math.max(1, Math.ceil(words.length / cols));
    const cellW = (W - 2 * (halfLen + r)) / cols;
    const cellH = (H - 2 * r) / rows;
    words.forEach((w, i) => {
      if (map.has(w.word)) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = halfLen + r + cellW * (col + 0.5);
      const y = r + cellH * (row + 0.5);
      const angle = Math.random() * Math.PI * 2;
      map.set(w.word, {
        id: w.word,
        x, y,
        vx: Math.cos(angle) * BASE_SPEED,
        vy: Math.sin(angle) * BASE_SPEED,
        halfLen, r,
        frozen: false,
        popped: false,
      });
    });
  }, [words, bounds, bubbleSize]);

  // RAF loop — cancel only on cleanup so StrictMode's transient unmount doesn't
  // wipe body state.
  useEffect(() => {
    if (bounds.width === 0 || bounds.height === 0) return;
    let rafId = 0;
    let last = performance.now();
    const step = (now) => {
      const rawDt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const map = bodiesRef.current;
      const { width: W, height: H } = boundsRef.current;

      for (let sub = 0; sub < SUBSTEPS; sub++) {
        const dt = rawDt / SUBSTEPS;
        for (const b of map.values()) {
          if (b.frozen || b.popped) continue;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
        const active = [];
        for (const b of map.values()) if (!b.popped) active.push(b);
        for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
          for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
              resolvePair(active[i], active[j]);
            }
          }
          for (const b of active) clampToWalls(b, W, H);
        }
      }

      for (const b of map.values()) {
        if (b.popped) continue; // popped node is under CSS transition control
        const el = nodeMap.current.get(b.id);
        if (!el) continue;
        const px = b.x - b.halfLen - b.r;
        const py = b.y - b.r;
        el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
        if (el.style.opacity !== '1') el.style.opacity = '1';
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [bounds.width, bounds.height, nodeMap]);

  const freeze = useCallback((word) => {
    const b = bodiesRef.current.get(word);
    if (!b || b.popped) return;
    b.frozen = true;
    b.vx = 0;
    b.vy = 0;
  }, []);

  const unfreeze = useCallback((word) => {
    const b = bodiesRef.current.get(word);
    if (!b || b.popped) return;
    b.frozen = false;
    const angle = Math.random() * Math.PI * 2;
    b.vx = Math.cos(angle) * BASE_SPEED;
    b.vy = Math.sin(angle) * BASE_SPEED;
  }, []);

  const freezeAll = useCallback(() => {
    for (const b of bodiesRef.current.values()) {
      if (b.popped) continue;
      b.frozen = true;
      b.vx = 0;
      b.vy = 0;
    }
  }, []);

  const pop = useCallback((word) => {
    const b = bodiesRef.current.get(word);
    if (!b || b.popped) return;
    b.popped = true;
    b.frozen = false;
    b.vx = 0;
    b.vy = 0;
    const el = nodeMap.current.get(word);
    if (!el) return;
    const { height: H } = boundsRef.current;
    const bucketY = H + 40;
    const px = b.x - b.halfLen - b.r;
    el.style.transition = `transform ${POP_ANIM_MS}ms cubic-bezier(.4,0,.6,1), opacity ${POP_ANIM_MS}ms`;
    el.style.transform = `translate3d(${px}px, ${bucketY}px, 0) scale(0.35)`;
    el.style.opacity = '0';
  }, [nodeMap]);

  const addBubble = useCallback((word) => {
    const map = bodiesRef.current;
    const existing = map.get(word);
    if (existing && !existing.popped) return;

    const { width: W, height: H } = boundsRef.current;
    const { width: bw, height: bh } = sizeRef.current;
    const halfLen = Math.max(0, (bw - bh) / 2);
    const r = bh / 2;
    const minX = halfLen + r;
    const maxX = W - halfLen - r;
    const y = H - r - 4;
    const center = W / 2;
    const clearance2 = (2 * r + 4) ** 2;

    const active = [];
    for (const b of map.values()) if (!b.popped) active.push(b);

    let spawnX = center;
    let spawnY = y;
    let found = false;
    for (let offset = 0; offset <= (maxX - minX) / 2 + 20; offset += 20) {
      for (const dir of offset === 0 ? [1] : [1, -1]) {
        const cx = Math.max(minX, Math.min(maxX, center + dir * offset));
        let ok = true;
        for (const other of active) {
          const dx = cx - other.x;
          const dy = y - other.y;
          if (dx * dx + dy * dy < clearance2) { ok = false; break; }
        }
        if (ok) { spawnX = cx; spawnY = y; found = true; break; }
      }
      if (found) break;
    }
    if (!found) {
      spawnX = center;
      spawnY = H + r; // just outside, drifts in
    }

    map.set(word, {
      id: word,
      x: spawnX,
      y: spawnY,
      vx: (Math.random() - 0.5) * BASE_SPEED * 0.4,
      vy: -50,
      halfLen, r,
      frozen: false,
      popped: false,
    });
  }, []);

  const snapshot = useCallback(() => {
    const { width: bw, height: bh } = sizeRef.current;
    const { width: W, height: H } = boundsRef.current;
    // Copy live body centres so we can relax them without touching the sim.
    // Includes popped bodies — they retain their pop-time position and MUST
    // not overlap live bubbles in the outcome view.
    const bodies = [];
    for (const b of bodiesRef.current.values()) {
      bodies.push({ id: b.id, x: b.x, y: b.y, halfLen: b.halfLen, r: b.r });
    }
    separateForSnapshot(bodies, W, H);
    const positions = {};
    for (const b of bodies) {
      positions[b.id] = {
        x: b.x - b.halfLen - b.r,
        y: b.y - b.r,
        w: bw,
        h: bh,
      };
    }
    return { positions, width: W, height: H };
  }, []);

  return { freeze, unfreeze, freezeAll, pop, addBubble, snapshot };
}

// Post-Done relaxation for the outcome view. Iteratively pushes overlapping
// bodies apart along the closest-point normal and clamps back into the play
// area. Position-only — velocities aren't touched (bodies are frozen anyway).
function separateForSnapshot(bodies, W, H) {
  for (let iter = 0; iter < SEPARATION_ITERS; iter++) {
    let anyMoved = false;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const cp = closestPointsCapsule(a, b);
        const minDist = a.r + b.r + 2; // 2px gap so ring outlines don't touch
        if (cp.dist >= minDist) continue;
        const dist = Math.max(cp.dist, 0.0001);
        const nx = (cp.qx - cp.px) / dist;
        const ny = (cp.qy - cp.py) / dist;
        const push = (minDist - cp.dist) * 0.5;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        anyMoved = true;
      }
    }
    // Clamp to walls each iteration so bodies pushed out of bounds fold back.
    if (W > 0 && H > 0) {
      for (const b of bodies) {
        const minX = b.halfLen + b.r;
        const maxX = W - b.halfLen - b.r;
        const minY = b.r;
        const maxY = H - b.r;
        if (b.x < minX) b.x = minX;
        else if (b.x > maxX) b.x = maxX;
        if (b.y < minY) b.y = minY;
        else if (b.y > maxY) b.y = maxY;
      }
    }
    if (!anyMoved) break;
  }
}

function clampToWalls(b, W, H) {
  const minX = b.halfLen + b.r;
  const maxX = W - b.halfLen - b.r;
  const minY = b.r;
  const maxY = H - b.r;
  if (b.x < minX) { b.x = minX; if (!b.frozen && b.vx < 0) b.vx = -b.vx; }
  else if (b.x > maxX) { b.x = maxX; if (!b.frozen && b.vx > 0) b.vx = -b.vx; }
  if (b.y < minY) { b.y = minY; if (!b.frozen && b.vy < 0) b.vy = -b.vy; }
  else if (b.y > maxY) { b.y = maxY; if (!b.frozen && b.vy > 0) b.vy = -b.vy; }
}

function resolvePair(a, b) {
  const closest = closestPointsCapsule(a, b);
  const minDist = a.r + b.r;
  if (closest.dist >= minDist) return;
  const dist = Math.max(closest.dist, 0.0001);
  const nx = (closest.qx - closest.px) / dist;
  const ny = (closest.qy - closest.py) / dist;
  const penetration = minDist - dist;

  const aMovable = !a.frozen;
  const bMovable = !b.frozen;
  if (aMovable && bMovable) {
    a.x -= nx * penetration * 0.5;
    a.y -= ny * penetration * 0.5;
    b.x += nx * penetration * 0.5;
    b.y += ny * penetration * 0.5;
  } else if (aMovable) {
    a.x -= nx * penetration;
    a.y -= ny * penetration;
  } else if (bMovable) {
    b.x += nx * penetration;
    b.y += ny * penetration;
  }

  const vAn = a.vx * nx + a.vy * ny;
  const vBn = b.vx * nx + b.vy * ny;
  // Only apply velocity change when bodies are closing along the normal.
  // Otherwise iterated constraint passes swap velocities back and forth.
  const closing = vAn - vBn > 0;
  if (!closing) return;
  if (aMovable && bMovable) {
    const dvA = vBn - vAn;
    const dvB = vAn - vBn;
    a.vx += dvA * nx;
    a.vy += dvA * ny;
    b.vx += dvB * nx;
    b.vy += dvB * ny;
  } else if (aMovable) {
    a.vx -= 2 * vAn * nx;
    a.vy -= 2 * vAn * ny;
  } else if (bMovable) {
    b.vx -= 2 * vBn * nx;
    b.vy -= 2 * vBn * ny;
  }
}

// Closest points between two horizontal capsule inner segments.
// a: [a.x - a.halfLen, a.x + a.halfLen] at y = a.y
// b: [b.x - b.halfLen, b.x + b.halfLen] at y = b.y
function closestPointsCapsule(a, b) {
  const aL = a.x - a.halfLen;
  const aR = a.x + a.halfLen;
  const bL = b.x - b.halfLen;
  const bR = b.x + b.halfLen;
  let px, qx;
  if (aR >= bL && aL <= bR) {
    // x-ranges overlap — normal is purely vertical, both closest points share
    // the overlap midpoint's x, each at its own body's y.
    const midX = (Math.max(aL, bL) + Math.min(aR, bR)) / 2;
    px = midX;
    qx = midX;
  } else if (aR < bL) {
    px = aR;
    qx = bL;
  } else {
    px = aL;
    qx = bR;
  }
  const py = a.y;
  const qy = b.y;
  const dx = qx - px;
  const dy = qy - py;
  return { px, py, qx, qy, dist: Math.sqrt(dx * dx + dy * dy) };
}

export const BUBBLE_POP_ANIM_MS = POP_ANIM_MS;
