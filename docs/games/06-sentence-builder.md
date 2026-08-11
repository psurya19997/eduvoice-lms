# Sentence Builder — Product Requirements Document (PRD)

## 1. Overview
Sentence Builder is a grammar-focused game where students construct sentences by dragging/tapping word tiles into empty slots. The game features a progressive difficulty curve, rich story contexts, pencil-sketch visuals, and multi-layered hints.

---

## 2. Universal Database Schema
To support all variants dynamically without hardcoding React logic, we use a single, generalized schema with JSON payloads.

### Table: `sentence_builder_sessions` (Authored Content)
*   `id` (uuid, PK)
*   `game_id`, `level_id` (uuid, FK)
*   `step` (int) - *e.g., Step 1, Step 2*
*   **`session_order`** (int, NOT NULL) - *1..N within a `(level_id, step)`. Drives play sequence, the within-step ramp (S1 easiest, SN hardest), Variant H's grow chain, and `session_intro` visibility (shown only when `session_order = 1`). Enforce `UNIQUE (level_id, step, session_order)`.*
*   `mechanic` (text) - *e.g., 'narrate', 'grow', 'recast'*
*   `story_name` (text) - *e.g., "A Trip to the Market"*
*   `context_setting` (text) - *Subheader context*
*   `image_url` (text) - *The visual prompt (if NULL, UI uses anchor_text)*
*   **`anchor_text`** (text) - *Replaces Hindi_text or Recast_text. The main prompt when there is no image.*
*   **`speaker_character`** (text, FK `game_characters.key`) - *Character portrait shown beside anchor_text. Required for variants D (Chotu) and E (Bibi). May coexist with `image_url` — when both are set, the scene image renders above the portrait+bubble row. NULL for A, B, H unless the author wants a character to appear there.*
*   **`hint_1`** (text), **`hint_2`** (text) - *Two-stage hint. Convention: hint_1 = simple English clue, hint_2 = Hindi L1 support (or deeper explanation). Author uses them flexibly. See §3.8 for behaviour rules.*
*   **`session_intro`** (text, nullable) - *"How to play this step" note. Populated ONLY on the session where `session_order = 1` in each step; leave NULL for session 2+. Author writes English + Hindi in one string separated by newline. Frontend shows an intro modal on first entry, dismiss writes `localStorage[sb_intro_<level>_<step>] = true`.*
*   `time_limit_seconds` (int) - *Overall timer for the session. **Alpha default: 180 (3 minutes)** — every Alpha session is authored with this value. If the timer expires before Done is pressed, the attempt is written with `attempt_status='timeout'` (+3 pts, no mastery update — see §5).*
*   `flash_duration_ms` (int) - *Specifically controls how long Variant B text stays visible (e.g., 3000)*
*   `voice_bonus_enabled` (bool, **defaults false**) - *Off on every session unless the author explicitly sets it to true. If true, the mic bubble appears on the outcome screen after Done. Kept per-session so voice can be reserved for sessions where speaking the answer aloud adds pedagogical value (typically ~1 session per step, not all of them). Scoring-neutral (see §5.2).*
*   `voice_prompt_text` (text, nullable) - *Ignored if `voice_bonus_enabled = false`. When voice IS enabled, this is the custom prompt shown in the mic bubble. Leave blank to use the default *"Say the sentence out loud"* — most sessions won't need a bespoke prompt.*
*   **`layout`** (jsonb) - *Array dictating UI layout. e.g., `[{"type": "locked", "word": "The"}, {"type": "slot"}]`*
*   **`valid_sentences`** (jsonb) - *Array of full sentence arrays to prevent broken permutations.*
*   **`tiles`** (jsonb) - *Pool of target words + distractors.*

### Table: `game_characters` (Shared across all games)
Cross-game character registry so WF, SB, and future games all reference the same 4 characters (Raju / Meera / Chotu / Bibi). New games add rows here rather than defining their own character system.

*   `key` (text, PK) - *e.g. 'raju', 'meera', 'chotu', 'bibi'*
*   `display_name` (text) - *e.g. "Raju"*
*   `portrait_url` (text) - *Supabase Storage path to the pencil-sketch portrait, shown in mascot bubbles*
*   `bio_en` (text, nullable) - *Optional first-meet overlay text*
*   `bio_hi` (text, nullable) - *Hindi bio*

### Table: `sentence_builder_attempts` (Activity Log)
*   `id` (uuid, PK)
*   `student_id`, `session_id` (uuid, FK)
*   `placed_tiles` (text[]) - *The words the child dropped into the slots.*
*   `correct_placements_count`, `wrong_placements_count` (int) - *Calculated by overlap matching.*
*   `is_correct` (bool) - *True ONLY if the sentence is 100% grammatically valid.*
*   **`voice_audio_url`** (text) - *Supabase Storage path where the recorded audio is stored. Path convention: `sb-voice/{student_id}/{session_id}/{attempt_id}.webm`. NULL if the child skipped the voice bonus or the browser had no Web Speech support.*
*   **`hints_used`** (jsonb) - *Analytics only. e.g. `{"hint_1": true, "hint_2": false}`. Tracks whether each hint overlay was opened at least once during this attempt. Never used in scoring at Alpha; drives "did hint use correlate with correctness?" analysis later.*

**Voice bonus fallback UI:** if the browser does not support Web Speech (older Android browsers, Xiaomi default browser, etc.), the mic bubble is still rendered but shows a friendly *"Voice needs a newer browser"* message on tap. The child can still press Next and continue. Voice is scoring-neutral by design — nothing about progression depends on it.

---

## 3. Content Design Rules & Edge Cases

### 3.1. The "Locked Word" Rule
*   **The Trap:** If a puzzle tests Subject-Verb agreement (e.g. matching "boys" to "are"), you **cannot** lock the verb (e.g., `[slot] [locked: "are"]`). If you do, the child will just match the syntax without looking at the image, bypassing the semantic lesson.
*   **The Rule:** If a grammatical pairing is being tested, both halves of the pair must be open slots.

### 3.2. Full-Sentence Validation
*   We do NOT validate slots independently (e.g., Slot 1 accepts "He" or "The boy", Slot 3 accepts "a" or "an"). This accidentally allows Frankenstein sentences like *"He has a apple"*.
*   Instead, we validate the entire sentence. `valid_sentences` stores explicit arrays: `[["The", "boy", "has", "an", "apple"], ["He", "has", "a", "fruit"]]`. 

### 3.3. Overlap Matching for Partial Scoring
*   If a child builds a broken sentence, the UI compares their `placed_tiles` against *every* array in `valid_sentences`. It picks the sentence with the highest overlap score, and uses that single sentence to determine which specific tiles should glow red or green.
*   **Prefer same length first.** When picking the "best matching" valid sentence, first filter to valid sentences whose word count equals the child's placed-tile count. Pick the highest-overlap sentence from that filtered set. Fall back to different-length sentences only if none match. Prevents comparing "The boy has a apple" (5 tiles) against "He has a fruit" (4 tiles) and marking the wrong tile as the mistake.
*   **Tie-break within same length.** If two same-length valid sentences overlap the child's placement equally, **array order in `valid_sentences` wins** — the first entry authored is treated as canonical. Content authors put the most likely answer first.
*   **Empty placement.** If the child presses Done with fewer tiles than slots, the attempt is allowed through, `score = 0`, marks as wrong. The Done button does NOT auto-disable — the child chooses to submit an incomplete answer. Aborted-writer only fires on unmount, not on Done with empties.
*   **Fewer tiles placed than any valid sentence.** Same-length filter returns no matches → fall back to comparing overlap across all lengths in `valid_sentences`, pick the highest. Rare in practice (means the child placed way fewer tiles than the layout has slots) but handled cleanly.

### 3.4. Implicit Layout Positions
*   The `layout` JSON array does not need explicit `position: 1` keys. Because it is an array, the React UI derives the position from the index (0, 1, 2) when rendering left-to-right.

### 3.5. Uniform Done Button
*   Every variant ends the same way: the child presses a **Done** button once they've made their choices. Applies to A, B, D, E, H uniformly.
*   Variant D does NOT auto-complete when the fix is picked — the child still presses Done. Gives them a moment to review; keeps the frontend shell simple (one completion path, no special cases).
*   If the child leaves before pressing Done, the attempt is written with `attempt_status='aborted'` (matches WF's pattern in `src/lib/games/wfComplete.js`).

### 3.6. Chip Placement & Undo
*   **Filling:** tap a bank chip → it fills the **leftmost empty blank** in the sentence.
*   **Undoing:** tap a placed chip → it returns to the bank; that blank becomes empty again.
*   Simple, works for 1 blank or 10 blanks. Matches WF's toggle-pick pattern.

### 3.7. Outcome View — Show All Valid Answers
*   When the child gets a session wrong, the outcome screen shows every entry from `valid_sentences` as a list, so the child sees the full range of correct answers — not one arbitrarily chosen "canonical" one.
*   Example: if valid = `[["The tree is tall"], ["The tree is big"], ["The tree is green"]]`, the outcome screen shows all three under a *"You could have said:"* header.
*   When the child is fully correct, no list is shown — just the perfect-score celebration.

### 3.8. Hint System (Alpha)
*   A small `?` button in the header opens a hint overlay showing `hint_1` (simple English clue).
*   Inside that overlay, a *"Show more"* link reveals `hint_2` (Hindi L1 support). Kid cannot jump to hint_2 without seeing hint_1 first — progressive reveal.
*   **Both hints are free at Alpha.** No point cost. Kids exploring should never be penalised for curiosity.
*   Both hints are optional. The session works fine with hints untouched.
*   The overlay stays open until the kid taps outside or presses Done.
*   Analytics only: `sentence_builder_attempts.hints_used` records `{hint_1: bool, hint_2: bool}` per attempt (whether opened, not how many times).
*   Beta / Gamma may introduce a small point cost per hint (deferred; not in Alpha scope).

---

## 4. Game Variants: Content Blueprints

Sessions within a Step form a continuous "Story Chain". Here is exactly how each variant functions and how the data is authored to push maximum diversity.

### Variant A: Narrate the Scene
*   **Goal:** Child builds a sentence describing the image.
*   **Example Step Focus:** `is/are`, nouns.
    *   **Session 1 (High Support):** Image of Raju in park. Target: "Raju is in the park." Layout locks the first three words. Only 2 slots.
    *   **Session 2 (Medium Support):** Image of 1 tree. Target: "The tree is big." Layout locks "The". Bank includes "is" and "are" to test singular/plural.
    *   **Session 3 (Multiple Solutions):** Image of happy Raju. Valid Sentences: `["He is happy.", "Raju is glad."]` Layout gives only "is".
    *   **Session 4 (The Trap):** Image of 2 dogs. Layout locks "The". Bank has `["dog", "dogs", "is", "are"]`. Tests S-V agreement.
    *   **Session 6 (Boss Fight):** Target: "They are in the park." 5 slots, zero locked words.

### Variant B: Disappearing Model
*   **Goal:** The correct sentence flashes for 3 seconds, then vanishes. Child rebuilds from memory.
*   **Constraint:** Must restrict to ONE valid solution, otherwise the child is punished for misremembering synonyms.
*   **Frontend:** two internal phases inside `FlashBody` — `flashing` (shows target text for `flash_duration_ms`) → `placing` (text hides, layout + bank appear). Shell is unaware of the phase split; it just sees "kid still playing, Done not pressed."
    *   **Session 1 (Easy memory):** "The giraffe is tall." Flashes 3s. Layout locks "The giraffe".
    *   **Session 2 (Trap):** "The monkeys are funny." Flashes 3s. Layout locks "The". Bank includes "is/are". Image serves as a backup clue if memory fails.
    *   **Session 4 (Voice):** "The big lion is sleeping." After rebuilding, `voice_bonus_enabled = true` prompts them to say it.
    *   **Session 6 (Boss Fight):** "It is time to go home." 6 words flash. 0 locked words. Heavy working memory load.

### Variant C: Two Scenes, One Blank
*   **Goal:** Contrast. Screen shows two images side-by-side. One is highlighted.
    *   **Session 1 (Noun):** Left: 1 apple. Right: 3 apples (Highlighted). Target: "He has the apples".
    *   **Session 2 (Verb):** Left: 1 boy running (Highlighted). Right: 2 boys running. Layout: `[locked: "The"] [locked: "boy"] [slot] [locked: "running"]`. Bank: `["is", "are"]`.
    *   **Session 5 (Possession Trap):** Left: 1 girl with book (Highlighted). Target: "She has a book". Bank: `["She", "They", "has", "have"]`.

### Variant D: Chotu Says / Recast
*   **Goal:** Mascot appears with a broken English sentence in a speech bubble. Child must fix the error(s). Chotu's character portrait always sits beside the speech bubble (`speaker_character = 'chotu'`) so the screen is never text-only.
*   **Optional scene image:** A D session may also set `image_url` to add a scene image above the portrait+bubble row (e.g. showing Chotu doing whatever the broken sentence describes). Not required — a text-only D session is still fine because the portrait carries the visual weight.
*   **Multi-error allowed:** A D session can have one open slot (single-error, like the example below) OR multiple open slots (e.g., "He have a big cars" → both `have` and `cars` are wrong). Layout controls how many slots are open. Author chooses per session.
    *   **Execution:** 
        *   `anchor_text`: "He have a red car."
        *   `valid_sentences`: `[["He", "has", "a", "red", "car"]]`
        *   `layout`: `[locked: "He"] [slot] [locked: "a"] [locked: "red"] [locked: "car"]`
        *   **Mechanic:** The subject "He" is locked. Child must rely on internal grammar rules to realize "He" pairs with "has", dragging it into the slot.

### Variant E: From Hindi Bridge
*   **Goal:** Translate Hindi to English. No scene image — but Bibi's character portrait sits beside the Hindi sentence (`speaker_character = 'bibi'`), framing it as *"Bibi said this in Hindi — can you say it in English?"*
*   **Constraint:** The UI uses `anchor_text` to display the Hindi sentence at the top of the screen.
    *   **Session 1:** `anchor_text`: "यह एक सेब है।" Target: "This is an apple."
    *   **Session 2 (The Article Trap):** `anchor_text`: "लड़का खुश है।" (Hindi has no 'the'). Layout forces a slot before "boy" so the child realizes English requires "The".
    *   **Session 3 (Possession):** `anchor_text`: "मेरे पास एक कुत्ता है।" Translating 'Mere paas' to 'I have'.
    *   **Session 4 (Ambiguity):** `anchor_text`: "वह खुश है।" Valid Sentences accept BOTH `["He", "is", "happy"]` and `["She", "is", "happy"]`.

### Variant H: Grow the Sentence
*   **Goal:** A sentence physically expands over 4 sessions.
    *   **Session 1:** "I go". Layout: 2 slots.
    *   **Session 2:** "I go to school". Layout takes Session 1's answer and locks it: `[locked: "I"] [locked: "go"] [slot] [slot]`.
    *   **Session 3:** "I go to school with dad". Layout locks the first 4 words. Child adds prepositional phrase.
    *   **Session 4:** "I go to school with dad in the morning". Results in a 9-word sentence that feels easy because it was scaffolded incrementally.

> **Content constraint (important):** every session in a Variant H chain must have **exactly ONE valid_sentence**. No synonyms, no article alternatives, no "he/she" ambiguity. This is because Session N+1's layout pre-locks Session N's answer at authoring time — if S1 accepted two valid answers, the child could pick the one that doesn't match what S2 has hard-coded, and their own word would silently disappear when S2 loads. Author H sessions carefully: pick the single canonical form up front.

> **Content review checklist for Variant H** (no lint script — growth can insert new words anywhere in the sentence, not just at the end, so automated checks would produce false positives. Human review is the safety net):
> - Each session in the chain has exactly one `valid_sentence`.
> - Each session's sentence is **longer** than the previous session's (grows across sessions, never shrinks).
> - The **locked words** in each session are words the child would have placed in an earlier session — the reviewer traces the chain forward from S1 to SN to verify.
> - New slots in SN can be inserted **anywhere** in the sentence (start, middle, end) — position is the author's call, not a strict prefix.
> - **Never** edit an earlier session's `valid_sentence` without walking forward and updating every downstream session's layout accordingly.

---

## 5. Scoring, Mastery & Leaderboard

Reuses the shared machinery in [`04-data-model.md`](04-data-model.md). Specifics for SB:

### 5.1 Session score (per attempt)
```
score = ((correct_slots − wrong_slots) / total_slots) × 100
score is clamped to [0, 100] and rounded to int
is_correct = (score === 100)   // strict — perfect only, matches WF
```

### 5.2 Points (universal +3 / +5 rule)
- `completed` **and** `is_correct` → **+5 pts** written to `game_score`
- `completed` **and NOT** `is_correct` → **+3 pts**
- `timeout` → **+3 pts**
- `aborted` → **no `game_score` row**

After `game_score` insert, call `recalculate_student_scores(p_student_id)` RPC — same pattern as `src/lib/games/wfComplete.js`. This rolls SB points into weekly/monthly `scores` and the leaderboard.

### 5.3 Mastery (one hop per session, scaled by score)
For each skill in `game_skill_weights` for `(sentence_builder, level)`:
```
new_mastery = current_mastery + weight × ALPHA × (100 − current_mastery) × (score / 100)
where ALPHA = 0.15
```
Clamped to [0, 100], rounded to int. Written to `student_skill_mastery` + history row.

**Rationale:** WF uses one EWMA hop per correct pick, which unfairly inflates mastery in longer sessions. SB uses one hop per session, scaled by the session's score — uniform across variants (Variant D single-slot perfect = Variant B 8-slot perfect = full hop). Rewards partial success without penalising short-slot variants.

**No mastery update** for `aborted` or `timeout` attempts (matches WF).

---

## 6. Hub & Navigation

Copy Word Family's pattern exactly:

*   **Level tabs** (Alpha / Beta / Gamma) at the top.
*   **10 step cards** in a grid, showing progress (frontier step highlighted, locked steps greyed).
*   Tap a step → auto-plays the frontier session (highest `session_order` with no `completed` attempt).
*   Completed sessions replayable via a small "sessions in this step" list inside the step view.
*   Future steps locked until the previous step's frontier is reached.
*   Reference implementation: [`src/pages/WFHub.jsx`](../../src/pages/WFHub.jsx).

**One SB-only addition — voice bonus mic bubble:**
*   When a session has `voice_bonus_enabled = true`, a 🎙️ mic bubble appears on the outcome screen (alongside the standard *Next* button).
*   Tap the bubble → Web Speech captures the child's spoken sentence → uploads to Supabase Storage → path stored in `sentence_builder_attempts.voice_audio_url`.
*   Skip is always allowed; *Next* button remains active. Voice is scoring-neutral (see §5.2).
*   If Web Speech is unsupported on the device, the bubble shows *"Voice needs a newer browser"* on tap (see §2 fallback note).

---

## 7. Frontend Architecture

**File structure** (mirrors WF):

```
src/pages/SBHub.jsx                     ← copy WFHub — level tabs + 10 step grid
src/pages/SBSession.jsx                 ← shell — data fetch, header, Done, outcome, aborted-writer
src/lib/games/
  useSbSession.js                       ← hook: fetch session by (level, step, session_order)
  sbScoring.js                          ← pure overlap-matching function
  sbComplete.js                         ← write cascade: attempt → game_score → mastery → recalc RPC
src/components/games/sb/
  NarrateBody.jsx                       ← used by A, E, H (layout + bank + tap-to-fill)
  FlashBody.jsx                         ← B (2 internal phases: flashing → placing)
  RecastBody.jsx                        ← D (speech bubble + fix bank)
  SentenceCanvas.jsx                    ← shared: renders layout (locked + slot + punct)
  TileBank.jsx                          ← shared: shuffled chips, greys out placed ones
  ChipTile.jsx                          ← shared: single chip component
  SpeechBubble.jsx                      ← D-only
  CharacterPortrait.jsx                 ← D + E
  SBOutcome.jsx                         ← colored tiles + valid_sentences list + voice bubble
  SBIntroModal.jsx                      ← session_intro overlay (session_order = 1 only)
```

**Body contract** — all three variant bodies expose the same props:
```
{ session, placements, onPlace(chipId), onUndo(slotIdx), disabled }
```

**State ownership:**
- **Shell owns:** currentSession, placements array (length = number of open slots, initialised to nulls), phase (`play` / `outcome`), attempt result.
- **Body owns:** local UI only (tap animations, highlight states, FlashBody's flash-vs-place phase).

**Data flow:**
1. Shell mounts → `useSbSession` fetches session
2. Body renders → child taps → `onPlace` finds leftmost null in placements → shell updates
3. Done button enables when every slot is filled (placements has no null)
4. Kid taps Done → `sbScoring(placements, valid_sentences)` → shell shows outcome → `sbComplete` writes DB → route to next session
5. Unmount during `play` phase with any placement made → `sbComplete(attempt_status='aborted')` (matches WF exactly — writer fires ONLY if `placements.some(p => p !== null)`; empty-session unmounts write nothing)

> **Open questions for §7:**
> - `useSbSession` — cache-first with React Query, or plain `useState` + `useEffect` like WF? WF uses the latter; SB should probably match for consistency.

---

## 8. UI Layouts per Variant

**Vertical budget in the 400×812 phone frame** (matches WF's `PhoneFrame`):
- Header: ~60 px
- Body content: ~700 px
- Done button zone: ~60 px

**Baseline template (Variant A):**
```
Header (level · step chip · points chip)         60 px
Image (pencil sketch scene)                      250 px
Canvas (sentence with locked + slots)            150 px
Bank (shuffled chips, wraps to 2 rows)           150 px
Done button                                      60 px
------------------------------------------------
Total                                            670 px
```

**Per-variant deltas:**

| Variant | What changes |
|:-:|:-|
| **A** | Baseline as above. |
| **B** | Phase 1 (0–3 s): full body shows one giant centred sentence (~600 px), no canvas, no bank. Phase 2 (3 s+): reverts to baseline. |
| **D** | Image (250 px) replaced by `[Portrait 80 px] + [Speech bubble 300 px showing broken sentence]`. Fix bank is small (3–5 chips), takes ~100 px. |
| **E** | Image (250 px) replaced by `[Portrait 80 px] + [Hindi anchor_text 300 px]`. Canvas + bank standard. |
| **H** | Image shrinks to ~200 px. Canvas grows to ~200 px (wraps to 2 lines for 10-12 word sentences). Bank is small (only NEW chips for this session, ~100 px). |

**Two universal rules:**
- **Canvas wraps to 2 lines** if the sentence exceeds ~5-6 words. Font size stays constant; slot pill size stays constant.
- **Bank wraps to 2 rows** if it has more than ~5 chips. Chip size fixed at ~80 × 40 px (readable tap target).

> **Open questions for §8:**
> - Is landscape orientation supported, or portrait-only like WF?
> - What font size for the Variant B flash sentence — big enough to read in 3 s but must fit 10+ words. Recommend 24-28 pt with 2-line wrap allowed.
> - Speech bubble tail styling — recommend a simple CSS triangle pointing at the portrait, no fancy shadows.

---

## 9. Voice Upload Flow

**When the mic bubble appears:** on the outcome screen if `session.voice_bonus_enabled = true`. Always beside the *Next* button; never blocks.

**Four states the frontend handles:**

| State | When | UI |
|:-|:-|:-|
| **unsupported** | Web Speech API missing (`!('mediaDevices' in navigator)` or similar) | Mic bubble visible but shows *"Voice needs a newer browser"* on tap. |
| **denied** | Mic permission denied by user or OS | *"Please allow mic access to record"* on tap; single retry allowed. |
| **uploaded** | Recording succeeded, upload to Storage succeeded, `voice_audio_url` written | Green tick beside mic bubble: *"Recording saved ✓"*. |
| **failed** | Recording OK but upload failed (network) | *"Couldn't save recording — try again?"* single retry allowed. |

**Storage path convention** (per §2):
```
game-voice/{student_id}/{session_id}/{attempt_id}.webm
```

**Flow:**
1. Kid taps mic → check browser support → if unsupported, show state 1 message, stop.
2. Request mic permission → if denied, show state 2 message.
3. Start recording → child speaks → 5s max (auto-stop) or manual stop button.
4. Upload blob to Supabase Storage via `supabase.storage.from('game-voice').upload(path, blob)`.
5. On success: write `voice_audio_url` to `sentence_builder_attempts.voice_audio_url` for the last completed attempt.
6. Kid can press *Next* at any time; recording continues in the background if in progress. If they leave, the upload is cancelled silently.

> **Open questions for §9:**
> - Which Storage bucket — public read (anyone with URL can play) or private with signed URLs? Private + signed URLs is safer for student audio but requires a signing step on the teacher review page.
> - Max recording duration — 5 s auto-cutoff, or 10 s, or unlimited? Kids can ramble; teacher review load matters.
> - MIME type — `audio/webm` is universally supported by Web Speech Recorder API; confirm this works for teacher-side playback.
> - Should we transcribe with Whisper later (post-pilot)? Currently no transcript stored (per §2).

---

## 10. Migrations + Seed Data

**Migration order matters.** Create in this sequence:

**Migration 1: `20260731000001_sb_schema.sql`**
```sql
CREATE TABLE public.game_characters (
  key            text PRIMARY KEY,
  display_name   text NOT NULL,
  portrait_url   text NOT NULL,
  bio_en         text,
  bio_hi         text
);

CREATE TABLE public.sentence_builder_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id              uuid NOT NULL REFERENCES public.games(id),
  level_id             uuid NOT NULL REFERENCES public.levels(id),
  step                 int  NOT NULL CHECK (step BETWEEN 1 AND 10),
  session_order        int  NOT NULL,
  mechanic             text NOT NULL CHECK (mechanic IN ('narrate','flash','recast','grow')),
  story_name           text NOT NULL,
  context_setting      text,
  image_url            text,
  anchor_text          text,
  speaker_character    text REFERENCES public.game_characters(key),
  hint_1               text,
  hint_2               text,
  session_intro        text,
  time_limit_seconds   int,
  flash_duration_ms    int,
  voice_bonus_enabled  boolean NOT NULL DEFAULT false,
  voice_prompt_text    text,
  layout               jsonb NOT NULL,
  valid_sentences      jsonb NOT NULL,
  tiles                jsonb NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level_id, step, session_order)
);
CREATE INDEX sb_sessions_lookup_idx ON public.sentence_builder_sessions (level_id, step, session_order, is_active);

CREATE TABLE public.sentence_builder_attempts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id                uuid NOT NULL REFERENCES public.sentence_builder_sessions(id),
  placed_tiles              text[] NOT NULL DEFAULT '{}',
  correct_placements_count  int  NOT NULL DEFAULT 0,
  wrong_placements_count    int  NOT NULL DEFAULT 0,
  score                     int  NOT NULL DEFAULT 0,
  is_correct                boolean NOT NULL DEFAULT false,
  attempt_status            text NOT NULL CHECK (attempt_status IN ('completed','timeout','aborted')),
  duration_ms               int  NOT NULL,
  voice_audio_url           text,
  hints_used                jsonb DEFAULT '{}'::jsonb,
  played_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sb_attempts_student_played_idx ON public.sentence_builder_attempts (student_id, played_at DESC);
CREATE INDEX sb_attempts_session_played_idx ON public.sentence_builder_attempts (session_id, played_at DESC);
```

**Migration 2: `20260731000002_sb_seed_reference.sql`**
```sql
-- Flip sentence_builder game to active
UPDATE public.games SET is_active = true WHERE key = 'sentence_builder';

-- Skill weights for SB × Alpha (per docs/games/02-taxonomy.md — Grammar 60 / Writing 25 / Vocab 15)
-- NOTE: assumes 'grammar', 'writing', 'vocabulary' rows exist in public.skills (see open question below)
INSERT INTO public.game_skill_weights (game_id, level_id, skill_id, weight)
SELECT g.id, l.id, s.id, w.weight
FROM public.games g
CROSS JOIN public.levels l
JOIN (VALUES
  ('grammar',    0.60),
  ('writing',    0.25),
  ('vocabulary', 0.15)
) AS w(skill_key, weight) ON true
JOIN public.skills s ON s.key = w.skill_key
WHERE g.key = 'sentence_builder' AND l.key = 'alpha';

-- Repeat CROSS JOIN for beta and gamma with same weights (or new mix if Grammar dominance changes)

-- Seed the 4 characters
INSERT INTO public.game_characters (key, display_name, portrait_url, bio_en, bio_hi) VALUES
  ('raju',  'Raju',  'characters/raju.webp',  'A cheerful boy from a village near Nashik.',   'नाशिक के पास के गांव का एक हँसमुख लड़का।'),
  ('meera', 'Meera', 'characters/meera.webp', 'A curious girl who loves the mela.',           'मेले से प्यार करने वाली एक जिज्ञासु लड़की।'),
  ('chotu', 'Chotu', 'characters/chotu.webp', 'The friendly farm cow.',                       'खेत की मिलनसार गाय।'),
  ('bibi',  'Bibi',  'characters/bibi.webp',  'The wise grandmother of the household.',       'घर की समझदार दादी।');
```

**Migration 3+**: authored session content (`INSERT INTO public.sentence_builder_sessions ...` per session). One migration per step is reasonable — small, reversible, reviewable.

> **Open questions for §10:**
> - **Does `public.skills` already contain rows keyed `grammar`, `writing`, `vocabulary`?** WF only seeded `vocabulary` and `reading` (plus `grammar` for Beta/Gamma). SB Alpha needs all three from day one. Verify before running Migration 2.
> - Beta/Gamma skill weights — same 60/25/15 or different? PRD taxonomy says Beta shifts weights; not yet defined for SB.
> - Character portraits (`portrait_url`) — do we upload the actual pencil-sketch PNGs to Storage before running this seed, or seed with placeholder URLs and update later?
> - Should the migration also seed `game_skill_weights` for the yet-to-exist Beta and Gamma levels, or defer until those levels get content?

---

## 11. Content Authoring Workflow

### 11.0 Content Philosophy (guiding principles)

Every SB session must respect these pedagogical rules — they preceded the mechanic-specific rules and still apply on top of them.

**General story & content:**
- **Narrative arcs over random sentences.** A Step is a cohesive story with a beginning, conflict, helper, resolution (e.g. *The Magic Balloon*). Not a disjointed vocabulary list.
- **One variant per step.** Do not mix `narrate` / `flash` / `recast` in a single step — keeping the mechanic identical across all sessions in a step drops cognitive load so the child focuses on language, not re-learning the game.
- **Implicit grammar scaffolding via locked words.** When teaching a new concept (e.g. action verbs), lock the target word (`stuck`, `climbs`) on the canvas. The child absorbs its meaning from the scene image + surrounding sentence context they're building.
- **Pronoun progression.** Deliberately build on previous sessions — Session 1 uses "The balloon", Session 2 replaces it with the pronoun "It".
- **Bilingual, targeted hints.**
  - *Hint 1 (English):* gentle context clue about the image/story.
  - *Hint 2 (Hindi):* direct pedagogical scaffolding predicting exactly where the child might fail based on the distractors (e.g. explicitly explaining "It" vs "He" for an object).

**Visuals & art:**
- **Storybook aesthetic.** Warm, whimsical, "classic children's book watercolor" illustrations. Feels like a premium comforting storybook, not a sterile quiz.
- **Horizontal layout (16:9).** Always landscape images. Phones have limited vertical space; horizontal images fit the top of the UI without pushing tiles off-screen.

**Variant D (`recast`) specifics:**
- **Characters are guides, not subjects.** Bibi / Raju / Meera / Chotu don't have to be the subjects of the story. They are friendly narrators guiding the child through an external story.
- **Conversational anchor text.** The narrator's speech bubble drives the story forward, preferably with a direct question (*"He got the balloon… but what will he do?"*). This prompts the child to build the answer on the canvas below.
- **Image integration.** Recast sessions must include a scene image at the top to visually ground the narrator↔child conversation.

### 11.1 Manual authoring (default)
For a single session or small batches, the author writes SQL by hand and submits a migration under `supabase/migrations/`:
- Copy an existing session's INSERT statement as a template.
- Fill in `story_name`, `context_setting`, `image_url`, `layout`, `valid_sentences`, `tiles`, `hint_1`, `hint_2`, etc.
- Set `voice_bonus_enabled = false` by default; `true` only on the ~1 session per step where speaking makes sense.
- Set `time_limit_seconds = 180`, `flash_duration_ms = 3000` for B sessions.
- One migration per step is a good unit — small, reversible, reviewable.

### 11.2 Antigravity-assisted authoring
For batch creation (whole story arc, 5–7 sessions at once), feed Antigravity the following inputs and ask it to generate SQL:
- The step's `story_name`, `mechanic`, and `character` (Raju / Meera / Chotu / Bibi).
- Grammar target for the step (`is/are` / `has` / `was/were` / etc.).
- Sentence-size ramp target (S1 = 4-5 words, SN = 8-9 words).
- Number of sessions to produce.
- Any specific vocabulary to include (India-centric: mela, dhoti, chai, roti).

**Ask Antigravity to specifically consider:**
- **Multi-valid answers** — every session should have ≥1 acceptable alternative in `valid_sentences` unless it's a Variant B or Variant H (both restricted to single valid).
- **Distractor diversity** — bank should have 2-3 distractors that could plausibly fool a kid (e.g. `has/have`, `is/are`) rather than random unrelated words.
- **Locked Word Rule** — do NOT lock the grammatical target being tested (see §3.1).
- **Growth carry-over** for Variant H — SN's locked prefix must contain SN-1's answer verbatim; do not edit an earlier session's `valid_sentence` without walking the chain forward.
- **Character consistency** — every session in a step uses the same `speaker_character` OR the same character in the scene image.
- **Length ramp** — S1 shortest and most anchored, SN longest with more random slots.
- **Hindi hint (hint_2)** — always translate the *concept*, not word-for-word (avoid Hinglish).
- Output a `.sql` file that can be reviewed line-by-line before merging.

Human reviewer runs the file through the checklist in §4 Variant H callout and §3 Content Design Rules before applying the migration.

---

## 12. Implementation Status

SB shipped in 11 phases. Phases 1–9 are live; Phase 10 (voice recording) not started; Phase 11 (content) partial. See git history for the full per-phase changesets.

| Phase | Deliverable | Status | Key files |
|---|---|---|---|
| 1 | Backend schema (3 tables + skill weights + characters) | ✅ live | migrations `20260731000001`, `20260731000002` |
| 2 | `game-assets` storage bucket + 4 character portraits | ✅ live | `characters/{raju,meera,chotu,bibi}_portrait.jpg` (portraits are 450–900KB JPEGs; content-debt follow-up: re-export as ~20KB WebP) |
| 3 | Overlap-matching engine (13 unit tests) | ✅ live | `src/lib/games/sbScoring.js`, `scripts/test-sb-scoring.mjs` |
| 4 | Write cascade (attempt → game_score → mastery → RPC) | ✅ live | `src/lib/games/sbComplete.js` |
| 5 | Session data hook (frontier auto-pick) | ✅ live | `src/lib/games/useSbSession.js` |
| 6 | Hub page | ✅ live | `src/pages/SBHub.jsx`, `src/lib/games/sbProgress.js` |
| 7 | Session shell (header, dispatch, timer, aborted-writer, intro modal) | ✅ live | `src/pages/SBSession.jsx` |
| 8 | Variant bodies + shared components (3 bodies + 5 shared) | ✅ live | `src/components/games/sb/*` |
| 9 | Outcome view (colored tiles + all valid_sentences + points chip) | ✅ live | `src/components/games/sb/SBOutcome.jsx` |
| 10 | Voice recording (record → upload → `voice_audio_url`) | ⏳ not started | needs `game-voice` bucket public/private decision (§9 Q1) |
| 11 | Content — one seed session per variant + full Step 1 | ⚠️ partial | Alpha Step 1 (`The Magic Balloon`, 5 recast) + Step 2 (`Feed the Hungry Puppy!`, 5 narrate) live; Steps 3–10 and Beta/Gamma not authored |

### Cross-phase regression checks (run at end of each phase)

- **WF regression:** Word Family still works — SB migrations shouldn't break WF.
- **Leaderboard:** an SB `completed` session scoring 100 moves weekly `scores` by +5.
- **Badges:** `weekly_streak` badge counts SB activity (game_score writes cover both).
- **Aborted rows:** DB isn't spammed with `attempt_status='aborted'` rows (only fires when placements > 0).

### Open dependencies

- **`game-voice` bucket public vs private** — private + signed URLs is safer for student audio but requires signing on teacher review page. Blocking Phase 10. (See §9 Q1.)
- **Landscape orientation support** — decide before authoring beyond Step 2. (See §8 open questions.)
- **Beta/Gamma skill weights** — same 60/25/15 as Alpha or different? PRD taxonomy hints at a shift; not defined yet for SB. (See §10 Q2.)
- **Voice bucket transcription** — currently no transcript stored; revisit post-pilot whether to send audio through Whisper. (See §9 Q4.)
