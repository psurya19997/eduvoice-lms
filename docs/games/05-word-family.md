# Word Family — Game Specification

Word Family is EduVoice's foundation vocabulary game. Kids see a set of word tiles and pick the ones that belong to a semantic category (e.g. *animals*, *food*, *feelings*).

This doc captures WF's game-specific tables, gameplay logic, scoring formula, and configuration. Shared machinery (universal tables, mastery formula, points rule, attempt-status matrix) lives in `04-data-model.md` — read that first.

---

## Purpose & pedagogy

**Primary skill (all levels):** Vocabulary — weight 0.70 (Alpha), 0.65 (Beta), 0.50 (Gamma).
**Secondary skill:** Reading — weight 0.30 (Alpha), 0.25 (Beta), 0.40 (Gamma).
**Tertiary skill (Beta+ only):** Grammar — weight 0.10 (Beta and Gamma; no Grammar weight at Alpha).

Weights are stored per `(game, level)` in `game_skill_weights` — see `04-data-model.md` for how they're applied. Full row-level table further below.

**Pillars engaged** (see `01-theory.md`):
- **P1 (i+1)** — content leveled by CEFR
- **P5 (L1 Translanguaging)** — Hindi hint on tap (Alpha), fades at higher levels
- **P6 (Dual Coding)** — word + image + audio triple at Alpha
- **P7 (Affect)** — encouraging feedback, no red X
- **P2 (Pushed Output)** — activated at later steps via `require_production` flag

---

## Tables (2 game-specific)

### `word_family_sessions` — pre-built session content

Each row is one deterministic session template. Content team hand-crafts each session.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `game_id` | uuid FK games.id | Always word_family's id |
| `level_id` | uuid FK levels.id | alpha / beta / gamma |
| `step` | int | 1-10 (CHECK) |
| `category_name` | text | Semantic category being tested (`animals`, `food`, ...) |
| `number_of_words` | int | Total tiles (targets + distractors) |
| `words` | jsonb | Array — see shape below |
| `hint` | text nullable | Optional authoring hint for the kid or teacher |
| `time_limit_seconds` | int nullable | NULL = no time limit |
| `show_category_prompt` | bool | default `true` — display "Pick all the animals" header |
| `show_image` | bool | default `true` — tiles display images |
| `l1_support` | text | `on_tap` / `wrong_only` / `off` (default `on_tap`) |
| `require_production` | bool | default `false` — mic activates for spoken category name |
| `is_active` | bool | default `true` |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()`, auto-updated on change |

**`words` JSONB shape:**
```json
[
  {"word": "cat",  "is_target": true,  "l1_hindi": "बिल्ली", "image_url": "https://.../cat.svg"},
  {"word": "dog",  "is_target": true,  "l1_hindi": "कुत्ता",  "image_url": null},
  {"word": "bus",  "is_target": false, "l1_hindi": "बस",     "image_url": null}
]
```

- `is_target = true` → correct answer (should be picked)
- `is_target = false` → distractor (should be rejected)
- `l1_hindi` — Hindi translation, nullable
- `image_url` — full URL to image asset, nullable

**Indexes:** `(game_id, level_id, step, is_active)`.

---

### `word_family_attempts` — per-play event log

Written **for every session played**, regardless of outcome (`completed` / `timeout` / `aborted`). Feeds engagement analytics.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid FK profiles.id | |
| `session_id` | uuid FK word_family_sessions.id | Which session was played |
| `picks` | text[] | Words the kid tapped (may be partial if aborted) |
| `correct_picks_count` | int | How many picks matched a target |
| `wrong_picks_count` | int | How many picks matched a distractor |
| `total_targets` | int | Denormalized from session for easy analytics |
| `is_correct` | bool | Session passed the "correct" threshold (see below) |
| `attempt_status` | text | `completed` / `timeout` / `aborted` |
| `duration_ms` | int | Time spent by kid |
| `played_at` | timestamptz | default `now()` |

**Indexes:** `(student_id, played_at DESC)`, `(session_id, played_at DESC)` for rotation logic.

---

## Session rotation logic

When a kid opens Word Family at a specific `(level_id, step)` that has multiple session rows:

1. Query all `word_family_sessions` for the (game, level, step) with `is_active = true`, ordered by `created_at ASC`.
2. For each candidate session, look up MAX(`word_family_attempts.played_at`) for **this student + this session_id**.
3. Pick the session with the **oldest** last-played timestamp (least recently used by this kid).
4. If tied with no history (never played) → **preserve database insertion (`created_at`) order** (`return 0;`).
5. If tied with actual play history → **random** pick from tied candidates.

**Effect:** kids rotate through all sessions at a step before repeating any. Unplayed sessions are presented in strict spreadsheet/curriculum sequence (guaranteeing narrative story intros appear first), while revision practice after the 3-day cooldown rotates smoothly via LRU.

**Example** — Aditya opens WF Alpha step 1 (which has 6 sessions in a Farm story arc, A to F):
- First visit (all unplayed): Pick **A** (Session 1: "Meet farmer Raju...")
- Second visit (B to F unplayed): Pick **B** ("Step outside to Raju's farmyard...")
- Third visit: Pick **C**
- Once all 6 played and cooldown expires: rotates via oldest actual play (LRU).

---

## Gameplay UX

**Session flow (kid-facing):**

1. **Intro** — brief screen: level, step, "Pick 4 tiles" (or however many targets).
2. **Play** — 6-10 tiles displayed in shuffled order. Kid taps tiles they think belong.
   - Category prompt shown at top (if `show_category_prompt = true`)
   - Tiles show word + image (if `show_image = true`)
   - Long-press tile → shows Hindi (if `l1_support = 'on_tap'`)
3. **Submit** — kid taps "Done" when they've picked their target_count tiles.
4. **Feedback** — all tiles reveal simultaneously:
   - Green outline: kid picked a target (correct)
   - Grey with target indicator: kid missed a target
   - Red outline: kid picked a distractor (wrong)
5. **Optional production step** (if `require_production = true`) — mic activates, kid speaks the category name aloud.
6. **Result screen** — shows what was right/wrong, mastery bar animation (no numeric score displayed), streak update.

**UX invariants:**
- **Target count is always shown** ("Pick 4 tiles").
- **Feedback is at the end**, never per-tap.
- **Tiles are shuffled every play** (same session, different tile positions each time).

---

## Score formula (Word Family)

**Written to `game_score.score`** (0-100 scale, defined per game — see `04-data-model.md`).

```
score = ((correct_picks_count − wrong_picks_count) / total_targets) × 100
```

Clamped to `0-100`.

**Examples** (with 4 targets in the session):

| correct_picks | wrong_picks | Calculation | Score |
|---|---|---|---|
| 4 | 0 | (4 − 0) / 4 × 100 | 100 |
| 3 | 0 | (3 − 0) / 4 × 100 | 75 |
| 3 | 1 | (3 − 1) / 4 × 100 | 50 |
| 2 | 2 | (2 − 2) / 4 × 100 | 0 (clamped) |
| 0 | 4 | (0 − 4) / 4 × 100 | 0 (clamped) |

Net accuracy — wrong picks actively subtract, discouraging the "tap everything" strategy.

---

## `is_correct` threshold (Word Family)

**Strict:** `is_correct = true` only when `score = 100`.

That is: **every target picked, zero wrong picks**. Perfection required.

**Impact:**
- `is_correct = true` → kid earns 5 leaderboard points (see universal Points rule in `04-data-model.md`).
- `is_correct = false` → kid earns 3 leaderboard points (still credited for the attempt).
- Either way, mastery updates run on the correct picks (see `04-data-model.md`).

---

## Config knobs (per-session flags on `word_family_sessions`)

| Flag | Default | Meaning |
|---|---|---|
| `show_category_prompt` | `true` | Display the category name at top ("Pick all the animals"). Content authors can turn off for harder sessions where kid must infer. |
| `show_image` | `true` | Each tile displays its image. Turn off at higher levels for Pillar 6 (Dual Coding) fade. |
| `l1_support` | `on_tap` | Hindi hint behavior: `on_tap` (long-press any tile), `wrong_only` (only shows for previously-missed words), `off` (no L1 hints). Fades α → γ per Pillar 5. |
| `require_production` | `false` | Whether the mic activates for kid to speak the category name after picking. Enables Pillar 2 (Pushed Output) at higher steps. |

Content authors set these per session — kids at α step 1 might see everything on; α step 9 might turn off L1.

---

## Correct atom definition

**One correct atom = one correctly-picked target tile.**

Source column: `word_family_attempts.correct_picks_count`.

This flows into:
- **`student_skill_mastery.correct_count`** — added to Vocabulary only (primary skill), per session.
- **`student_skill_mastery.mastery_pct`** — one EWMA update per correct pick, run sequentially (see `04-data-model.md` for the formula and worked example).

Wrong picks (distractors) do **not** count as atoms — they don't trigger mastery updates.

---

## Skill contribution mapping (per level)

Stored in `game_skill_weights` as rows — reflects the values actually seeded live (see `supabase/seed/reference/game_skill_weights.json`):

| game | level | skill | weight |
|---|---|---|---|
| word_family | alpha | vocabulary | 0.70 |
| word_family | alpha | reading | 0.30 |
| word_family | beta | vocabulary | 0.65 |
| word_family | beta | reading | 0.25 |
| word_family | beta | grammar | 0.10 |
| word_family | gamma | vocabulary | 0.50 |
| word_family | gamma | reading | 0.40 |
| word_family | gamma | grammar | 0.10 |

Weights sum to 1.00 per (game, level). Kids get faster Vocabulary growth than Reading from any WF session, since it's a vocabulary-primary game.

**Grammar was added to Beta and Gamma late in MVP-1 authoring** — earlier notes said "WF trains Grammar in some variants but does not update the Grammar mastery skill." That trade-off was reversed: Grammar mastery **does** now update on WF Beta/Gamma completions. Alpha still has no Grammar weight, so Alpha plays only move Vocabulary and Reading mastery.

---

## Universal behavior reminders (from `04-data-model.md`)

- **Points:** 3 on completion, 5 if `is_correct = true` (WF's `is_correct` requires perfect score).
- **Timeout:** kid still earns 3 points, but no mastery update, no history row.
- **Aborted:** no `game_score` row written, no mastery change. `word_family_attempts` row still recorded for engagement analytics.
- **Mastery:** only completed sessions update `student_skill_mastery`; wrong picks skipped in the EWMA.
- **History:** one `student_skill_mastery_history` row per completed session per skill touched (Vocabulary + Reading for WF).

---

## Deferred / open

- **Beta / Gamma content** — Alpha is fully shipped and live with 60 V4 sessions (10 steps × 6 sessions each) across 3 story arcs (Farm, Mela, Monsoon). Beta and Gamma to be authored later.
- **`require_production` steps** — which specific α steps flip this on. Currently `false` for all Alpha sessions.
- **Category difficulty ladder** — concrete categories (*animals*, *food*, *vehicles*) deployed at Alpha; abstract categories planned for Beta/Gamma.
- **Analytics UI** — kid's Progress page and teacher's per-student view use this data. Built after games ship.

---

---

## Play surface — Bubble Mode (live)

Design + implementation spec for the physics-driven play area that replaces the earlier static tile grid. This is a presentation-layer change only — no scoring, session-selection, or DB behavior is modified.

### Motivation

The former play surface (`PlayBody` → `TileGrid` → `Tile`) showed all session words as a static 2- or 3-column grid. Tapping toggled selection; then Done. Kids read that as "worksheet-like." A physics-driven surface (bubbles that drift, collide, and can be popped) turns the same picking mechanic into a game feel closer to a mobile arcade toy. The learning loop (see category → identify targets → select → check) is unchanged.

### Player experience

- Each word appears as a **capsule bubble** (emoji + word) floating in a fixed-height play area above a **bucket strip**.
- Bubbles drift slowly, bounce off walls, and bounce off each other.
- **Touching a bubble freezes it** under the finger. **Lifting the finger pops it** — bubble animates down into the bucket and appears as a chip.
- **Long-press (400ms)** on a frozen bubble reveals its Hindi translation.
- **Small drag off the bubble** (>8px) cancels the pop; bubble stays frozen for the rest of the press, resumes drifting on release.
- **Tapping a chip in the bucket** un-picks it: chip disappears, a new bubble respawns at a collision-safe slot along the bucket edge drifting upward.
- **Done** submits. On the outcome screen bubbles freeze in place and re-color (green = correct, amber = wrong, sky pulsing = missed target). Popped bubbles reappear at their pop location.

### Locked design decisions

| Decision | Choice | Reason |
|---|---|---|
| Scope | Replace tile grid entirely | Simpler code; one supported path |
| Bubble content | Emoji + word inside | Same info density as tiles |
| Un-pick gesture | Tap the bucket chip | Familiar tap-to-toggle |
| Outcome view | Freeze bubbles + re-color | Cohesive with play, no layout swap |
| Shape | Visual capsule; **capsule–capsule** collision | Long words need wider bubbles; circle collision lets wide bubbles visually pass through |
| Text minimum | 12px | Below 12px hurts early readers |
| Play area | ~500px tall, bucket strip ~80px | Enough drift room for 5–9 bubbles at ~72px |
| Tap behavior | Freeze-on-touch, pop-on-release | Kids' motor control; anchors long-press hint cleanly |
| Reduced-motion fallback | Not included | Revisit if playtesting surfaces complaints |

### Architecture

```
WFSession (unchanged wiring)
  ├── BubblePlayBody (replaces PlayBody)
  │     ├── uses useBubblePhysics (headless RAF hook, mutates DOM directly)
  │     ├── renders bubble DOM nodes (registered in nodeMap)
  │     └── renders bucket strip (React-managed list of picked chips)
  └── OutcomeBody
        └── FrozenBubbles (reads positions from bubblePositionsRef)
```

Parent contract preserved: `BubblePlayBody` accepts same props as `PlayBody` (`session, targetCount, picks, onToggle, onDone, submitting, onOpenHint`). Scoring, points, progress, session progression untouched.

### Done handoff sequence

Physics would keep drifting during the 100–500ms `wfComplete` await → snapshot at the top would be stale, snapshot at the bottom would jump-cut. Correct sequence in `WFSession.handleDone`:

1. `bubblePlayBodyRef.current.freezeAll()` — halts integration for every body synchronously. Kids get instant tactile feedback: bubbles stop.
2. `await wfComplete(...)` — bubbles are frozen; nothing moves.
3. `bubblePlayBodyRef.current.snapshot()` — writes positions into `bubblePositionsRef`.
4. `setPhase('outcome')` — `FrozenBubbles` reads the ref during outcome render.

`BubblePlayBody` exposes `freezeAll()` and `snapshot()` via `useImperativeHandle`.

> ⚠️ Snapshot must be synchronous with the phase flip. React may batch the phase change; outcome would render with a stale/empty ref if snapshot were deferred to a cleanup effect.

### Popped-body lifecycle

When a bubble is popped:
- `body.popped = true`, `body.vx = body.vy = 0`.
- Physics loop **skips popped bodies for integration and collision** — they neither move nor obstruct.
- DOM node unmounts after its "fall to bucket" animation; `nodeMap` entry removed via ref-callback cleanup.
- Body stays in `bodies` with its final `x, y` frozen — this is the pop location returned by `snapshot()`.

Rejected alternative: keep popped bodies as infinite-mass obstacles. That makes live bubbles bounce off nothing for the rest of the round — kids read it as a bug.

Consequence: a live bubble may drift into the ghost's coordinates before Done and outcome will render two capsules overlapping. Accepted as a rare cosmetic overlap.

### Files

**Modified:**
- `src/pages/WFSession.jsx` — swaps `<PlayBody/>` for `<BubblePlayBody ref={...}/>`, and `<TileGrid/>` in outcome for `<FrozenBubbles.../>`. Adds `bubblePositionsRef` and `bubblePlayBodyRef`; populates positions inside `handleDone` before phase change.

**New:**
- `src/components/games/BubblePlayBody.jsx` — play-phase UI (category prompt + physics area + bucket + Done).
- `src/components/games/useBubblePhysics.js` — headless RAF hook: integrates positions, resolves wall bounces and capsule–capsule collisions, writes `transform` directly to registered DOM nodes.
- `src/components/games/FrozenBubbles.jsx` — read-only outcome view; capsules at frozen positions with color per state.

**Kept for reuse (unused by WF now):** `TileGrid.jsx`, `Tile.jsx`.

**Unchanged:** all DB tables, `useWfSession.js`, `wfScoring.js`, `wfComplete.js`, `wfProgress.js`, `HintSheet.jsx`.

### `useBubblePhysics` — physics engine

**Body model:**
```
{ id, x, y, vx, vy, halfLen, r, frozen }
```
- `halfLen = (width - height) / 2` — inner axis-aligned segment length. Short words → `halfLen ≈ 0` (near-circle). Long words → `halfLen > 0`.
- `r = height / 2` — capsule end radius.
- Capsules stay axis-aligned (no rotation) — keeps math cheap.

**Per-tick** (fixed timestep ~1/120s with substeps for stable collisions):

1. Integrate position for non-frozen, non-popped bodies.
2. **Constraint pass, iterated 2–3× per tick:** capsule–capsule collision, then wall-clamp using AABB (reflect the appropriate velocity component; clamp to bounds).
   > ⚠️ A single pair-then-wall pass leaves jitter when a frozen capsule sits tangent to a wall. Iterating pair+wall lets both constraints settle in the same frame.
3. **Capsule–capsule collision** for every pair:
   - Find closest points on the two horizontal segments `[x-halfLen, x+halfLen]` at each body's `y`.
     - If x-ranges overlap → normal purely vertical.
     - Else → each closest point is the segment endpoint nearest the other segment (normal diagonal).
   - If distance < `r_a + r_b`, resolve: unit normal `n = (P_b − P_a) / distance`; project each velocity onto `n`; swap the two projected 1D components (equal mass, elastic); reconstruct; position-correct by pushing bodies apart along `n` by half the penetration each.
4. Frozen bodies don't integrate but still participate in collision (infinite mass).
5. Popped bodies neither integrate nor participate in collision; position preserved for snapshot only.

> ⚠️ Collision normal = closest-point vector, not an axis. Getting this wrong sends bubbles in visually wrong directions after brush-past.

**Rendering — bypass React:** consumer passes `nodeMap: Ref<Map<id, HTMLElement>>`; after each physics update, iterate bodies and write `nodeMap.current.get(id).style.transform = 'translate3d(x,y,0)'` directly. React re-renders only when the bubble list changes. `useSyncExternalStore` explicitly rejected — would fire full re-render at 60fps.

**`nodeMap` unregister on unmount:** ref callback is `(el) => { if (el) nodeMap.current.set(id, el); else nodeMap.current.delete(id); }`. Without `delete`, RAF loop writes transforms to detached DOM nodes indefinitely.

**Dynamic bounds:** parent attaches `ResizeObserver` to physics container; hook re-clamps body positions on resize. Never hardcode dimensions (iPhone SE 375×667, tablet/landscape differ).

**RAF lifecycle:** `useEffect` cleanup **must** cancel the RAF but **must not** wipe body state:
```js
return () => {
  cancelAnimationFrame(rafId);
  // do NOT reset bodies.current here
};
```
Cancelling prevents React 18 StrictMode from spawning two concurrent RAF loops that write to the same nodes → bubbles vibrate violently or launch off-screen. Wiping bodies on the transient unmount would leave the second real mount with an empty world. Seeding must be idempotent.

**Public API:**
```
{ freeze(id), unfreeze(id), freezeAll(), pop(id),
  addBubble(word), snapshot() }
```
No `removeBubble` — popped bodies stay in `bodies` so `snapshot()` returns positions. Snapshot may be keyed by `word` since session words are unique.

Tuning knobs (`speed`, `damping`, `restitution`, `hitRadiusScale`) live in the hook so UX tuning never touches JSX.

### `BubblePlayBody` — play-phase UI

Layout:
```
[compact category prompt + Find N + counter + ? hint]
[500px physics container — touch-action: none]
[80px bucket strip — flex-nowrap overflow-x-auto]
[Done button]
```

**Bubble sizing:** all bubbles in a session share one fixed width sized to fit the longest word. Simpler physics (single `halfLen` per body), single `measureText` per session, guaranteed no clipping.
- Wait for `document.fonts.ready` before first `measureText`.
- Canvas `ctx.font` must match CSS exactly, **including weight** — e.g. `'800 12px "Inter", sans-serif'`. Wrong weight → too-narrow capsules → clipped text.
- `sessionWidth = max(measureText(word).width for word in session.words) + 12px + emojiSlot`.
- Clamp `sessionWidth = min(sessionWidth, containerWidth - 40px)`.
- Height fixed ~72px so collision `r` is stable.

**Gesture handlers (all on the bubble element):**
- `onPointerDown` → `e.currentTarget.setPointerCapture(e.pointerId)` → freeze body → record start coords → start 400ms long-press timer.
- `onPointerMove` → if distance > 8px, cancel long-press, mark gesture as `dragged`. Bubble stays frozen.
- `onPointerUp` → release capture; unfreeze body; if not dragged and long-press did not fire → pop animation → `onToggle(word)`.
- `onPointerCancel` → release capture, unfreeze, no pop.

> ⚠️ Two non-negotiables: `touch-action: none` on the physics container (else mobile hijacks touchmove for scroll / pull-to-refresh); `setPointerCapture` on every `pointerdown` (else if finger drifts off the 72px capsule, `pointerup` fires on background and pop never triggers).

**Bucket:** `flex flex-nowrap overflow-x-auto` with hidden scrollbar. Chips keep natural width; horizontal swipe reveals overflow. Chip visual mirrors bubble (emoji + word). Tapping chip → `onToggle(word)` (parent removes from picks; local physics `addBubble(word)` respawns).

**Respawn placement:** naive spawn at fixed point risks overlap → position-correction fires a visible violent explosion (damping does not fix; impulse is position-space).
1. Walk candidate x positions along bucket edge (`y = H - r`) at 20px steps from center outward.
2. For each candidate, compute distance to every non-popped body's closest point.
3. Return first candidate with clearance ≥ `2r + 4px`.
4. If none (rare with 5–9 bubbles), spawn just below the visible container (`y = H + r`) with upward velocity.

Give respawned body a small upward `vy` (e.g. `-40 px/s`) so it visibly rises off the bucket.

**Long-press hint:** same 400ms timer + 1.8s auto-dismiss as former `Tile.jsx`. Anchors above the frozen bubble; bubble is stopped so no jitter.

### `FrozenBubbles` — outcome view

Props: `positions` (map word → `{x, y, w, h}`), `states` (word → `'correct' | 'wrong' | 'missed' | 'idle'`), `words`.

Renders capsules at handed-off positions with the same color palette as former `Tile.jsx` states. No motion, no interaction, no long-press. `missed` bubbles get the same gentle pulse as former missed tiles.

**Outcome layout preserves pedagogical info rows.** Today's `OutcomeBody` renders:
1. Headline + points chip
2. `TileGrid` inside `flex-1 min-h-0 overflow-y-auto` → replaced by `<FrozenBubbles>`
3. **Info rows for wrong picks ("didn't fit here") and missed targets ("this was an answer")** — the whole pedagogical payoff. **Preserved verbatim.**
4. Next / auto-advance controls

`FrozenBubbles` takes its natural physics-container height (matching play phase's ~500px) inside the same `overflow-y-auto` region; info rows flow below. On short viewports outcome scrolls vertically. Coordinates from `snapshot()` were captured in a 500px-tall container; `FrozenBubbles` uses the same fixed height so positions map 1:1.

### Implementation checklist — must-address gotchas

1. **No React re-render in the physics loop.** Direct `node.style.transform` mutation via `nodeMap`.
2. **`touch-action: none`** on the physics container.
3. **`setPointerCapture` on `pointerdown`** so pointerup fires on the bubble.
4. **Capsule–capsule collision** (not circle) so wide capsules don't pass through each other.
5. **Bucket overflows horizontally** with hidden scrollbar; does not squish chips.
6. **`await document.fonts.ready`** before `measureText`, plus 6px padding buffer per side.
7. **Done sequence: `freezeAll()` synchronously → await network → `snapshot()` → `setPhase('outcome')`.**
8. **RAF cleanup: `cancelAnimationFrame` only.** Do NOT reset `bodies.current`.
9. **Collision normal = closest-point vector**, not an axis.
10. **Constraint pass iterated 2–3× per tick** (pair → wall, repeated).
11. **Dynamic bounds via `ResizeObserver`**, never hardcoded.
12. **`ctx.font` includes weight** — `'800 12px …'`.
13. **Popped bodies skip physics entirely** but stay in `bodies` for `snapshot()`.
14. **Respawn via clearance search on the bucket edge** (not a fixed point).
15. **`nodeMap` ref-callback deletes** on unmount.
16. **Info rows preserved** in `OutcomeBody`.
17. **`picks` remains source of truth** for the abort-writer. Physics state is presentation-only.

### Verification

1. `npm run dev`, log in as student, open Word Family step 1.
2. **Physics sanity:** bubbles drift, bounce off all four walls, bounce off each other without tunneling, stable at 60fps. Test 5-word and 9-word sessions; test long words (mirror / towel) — wide capsules must bounce cleanly.
3. **Render-loop cost:** Chrome Perf, record 5s of play. React renders only on add/remove. JS-per-frame <2ms.
4. **Tap flow:** touch → freeze → release → pop → animates to bucket → chip → `picks` includes it. Drag off (>8px) → releases without popping.
5. **Pointer capture:** press bubble, slide finger off but stay in container, release — pop must fire.
6. **`touch-action: none`:** on real mobile, bubble drags must not scroll page.
7. **Un-pick:** tap chip → chip vanishes → new bubble respawns at bucket top drifting upward.
8. **Long-press hint:** hold 400ms → Hindi tooltip appears anchored to bubble; dismisses at 1.8s.
9. **Done + outcome:** press Done → freeze in place → colors correct/amber/sky-pulse → info rows render → countdown auto-advances.
10. **Session progression unchanged:** points, level progress, step picker all behave as before.
11. **Aborted attempt:** navigate away mid-play with picks → `word_family_attempts` row with `attempt_status='aborted'` and correct pick list.
12. **Small-viewport (iPhone SE 375×667):** ResizeObserver picks up new dimensions; bubbles bounce off true edges; bucket stays on-screen.
13. **StrictMode dev:** mount/unmount several times. Bubbles must behave calmly (vibration = missing RAF cleanup).

### Known trade-offs

- No `prefers-reduced-motion` fallback. Add TileGrid fallback if complaints surface.
- Empirical tuning. Speed, damping, hit tolerance, drag-cancel threshold need real-kid playtest iteration. All isolated in `useBubblePhysics.js`.
- Widest word sets minimum play-area width. Curriculum currently tops out around 6-letter words; monitor as content grows.

---

## Cross-references

- Shared machinery → `04-data-model.md`
- Theory pillars → `01-theory.md`
- Taxonomy (game / level / step / session naming) → `02-taxonomy.md`
- Product decisions (Games hub, streak, quest) → `03-product-decisions.md`
