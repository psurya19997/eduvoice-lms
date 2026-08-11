# Story Teller — PRD + Implementation Reference

**Status:** Phase 1 (reading + sentence highlighting) **SHIPPED live** on 2026-08-09. Phase 2 (assessment + Gemini + Q&A) not started.

**File location note:** the code and DB call this game `story_teller` (game.key). Historical filenames (`09-story-weaver.md`, "Story Weaver" in early PRDs) have been retired in favor of the current user-facing name **Story Teller**.

---

## 1. Concept

Kids read/listen to a short story broken into paragraphs. Each paragraph plays as pre-generated TTS audio with karaoke-style sentence highlighting. At the end of each paragraph the child self-selects: *understood → next*, *Hinglish mein sunna hai → replay in Hindi/English mix*, or *read again → replay in English*. After the last paragraph, the child records a verbal summary; Gemini reviews it, provides pre-submit feedback, and scores it 0–100. The child can also ask up to 2 voice questions about the story, answered by Gemini using only story text.

The pedagogical spine (from `01-theory.md`): scaffolded reading (audio + karaoke), translanguaging (Hinglish as safety net, not default), metacognitive check-ins per paragraph, and verbal production (harder to game than MCQ, forces active recall).

---

## 2. Level → Step → Session hierarchy

Same as all other games (`02-taxonomy.md`), specialized as:

- **Level** — alpha / beta / gamma (CEFR-aligned).
- **Step** — one whole story. `step BETWEEN 1 AND 10` per level.
- **Session** — one paragraph (5–10 sentences) of a story.
- After the last session of a step, the child transitions to the Assessment screen (Phase 2). In Phase 1 they transition to a placeholder "coming soon" complete screen.

Story-level fields (`story_name`, `key_beats`, `max_summary_duration_seconds`) are duplicated across every session row of a step — matching the Sentence Builder convention.

---

## 3. Data model

### Phase 1 (live)

**Migration:** `supabase/migrations/20260808000000_storyteller_schema.sql`. Applied to project `xlqnueqyqesfqwkbpwud` on 2026-08-09.

**`storyteller_sessions`** — story content (paragraph rows).
```
id, game_id, level_id, step, session_order, story_name,
sentences_en          jsonb -- [{text, start_ms, end_ms}, ...]
sentences_hi_mix      jsonb -- same shape
audio_en_url          text  -- storage path (bucket `game-assets`)
audio_hi_mix_url      text
key_beats             jsonb -- Phase 2 uses (nullable now)
max_summary_duration_seconds int -- Phase 2 uses (nullable now)
is_active             boolean, created_at, updated_at
UNIQUE (level_id, step, session_order)
```
Story-level fields (`story_name`, `key_beats`, `max_summary_duration_seconds`) intentionally denormalized onto every session row (SB `story_name` pattern).

**`storyteller_attempts`** — one row per decision-button click at the end of a paragraph.
```
id, student_id, session_id,
choice_made     text CHECK IN ('understood','need_help','read_again')  -- null iff aborted
attempt_status  text CHECK IN ('completed','aborted')
duration_ms, played_at
CHECK ((attempt_status='completed' AND choice_made IS NOT NULL)
    OR (attempt_status='aborted'))
```
Every click writes a fresh row (not an update) — kids who click `read_again` 5 times leave 5 rows for telemetry.

**`storyteller_errors`** — audio load failures & similar client-side issues.
```
id, student_id (nullable), session_id (nullable),
error_code text, detail jsonb, created_at
```

**RLS** — matches WF/SB convention:
- `storyteller_sessions`: any authenticated user may `SELECT` where `is_active=true`.
- `storyteller_attempts`: `INSERT`/`SELECT` restricted to `student_id = auth.uid()`.
- `storyteller_errors`: `INSERT` allowed when `student_id = auth.uid()` OR `student_id IS NULL`.

**Reference row:** `games.key='story_teller'`, `sort_order=9`, `is_active=true`, icon `📖`. Added via `supabase/seed/reference/games.json`.

### Phase 2 (not created yet)

Two future tables — see `docs/plans/` or the plan file for full spec:

- **`storyteller_summaries`** — student's verbal summary + Gemini's structured output (relevance/coverage bands, beats covered, positive_note, next_step, final_score). Trigger inserts into shared `game_score` on write.
- **`storyteller_qna`** — up to 2 voice-question/answer rows per (student, step).

---

## 4. Content pipeline

Manual authoring only in MVP. No admin UI.

**Pipeline (per story):**

1. Author story text in `scripts/content/<slug>.mjs` — English + Hinglish parallel arrays per session. Each session declares a 2-word `slug` for descriptive audio filenames.
2. Run `npm run seed:storyteller` — for each session × each language:
   - Build SSML with `<mark name="s1"/> … <mark name="s2"/> …` before every sentence and an `<mark name="end"/>` at the end.
   - Call Google Cloud TTS `v1beta1/text:synthesize` with `enableTimePointing: ['SSML_MARK']`.
   - Extract per-sentence `start_ms`/`end_ms` from returned timepoints.
   - Upload MP3 to `game-assets/storyteller/<game_level_step_order_lang_slug>.mp3` (upsert; overwrites cleanly on re-run).
   - Upsert `storyteller_sessions` row on `(level_id, step, session_order)`.

**Locked TTS config** (in the seed script — swap here to change voice for all future stories):
- **English:** `en-IN-Wavenet-E`, female, `speakingRate=0.7`, `pitch=+1.0`.
- **Hindi/Hinglish:** `hi-IN-Wavenet-F`, male, `speakingRate=0.95`, `pitch=0.0`.

The Wavenet tier is required because Neural2 and Wavenet both support SSML `<mark>` tags for timepoint extraction; Chirp3 HD voices don't (documented as a Phase 1 constraint).

**Env needed for seed:**
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS; server-only)
- `GOOGLE_TTS_API_KEY` (API key restricted to Cloud TTS API; no HTTP referrer restriction since it's called server-side)

**Companion scripts:**
- `scripts/tts-lab.mjs` (`npm run tts:lab`) — local browser UI at `http://localhost:5175` to audition voices, speeds, pitches before committing.
- `scripts/preview-tts.mjs` — CLI one-shot preview (superseded by tts-lab but kept for scripted checks).

**Seeded content today:**
- Story `nina-cycle` — *How Nina Learned to Ride a Cycle* — Alpha Step 1, 3 sessions, 25 sentences total. English + Hinglish MP3s uploaded, DB rows live.

---

## 5. Runtime UI

**Files:**
- `src/pages/STHub.jsx` — story hub (mirrors WFHub, warm rose/amber palette, story cards per step).
- `src/pages/STSession.jsx` — paragraph reader + player + decisions.
- `src/pages/STComplete.jsx` — Phase 1 placeholder complete screen ("Assessment coming soon").
- `src/lib/games/stProgress.js` — level progress loader; a story is "complete" when every session in the step has an `understood` attempt for this student.
- `src/lib/games/useSTAudio.js` — audio event hook: sentence-index tracking, retry-on-load-failure (2 tries with backoff, then surface error), state reset on sentence-array change.

**Routes (in `App.jsx`):**
- `/student/games/storyteller` → STHub
- `/student/games/storyteller/play?level=alpha&step=1&session=1` → STSession
- `/student/games/storyteller/complete?level=alpha&step=1` → STComplete

`GamesHub.jsx` maps `story_teller` game key to the hub route.

**STSession layout (iteration 2, live):**

```
┌─────────────────────────────────┐
│ Back  story_name          A/A/A │  Header with text-size toggle
├─────────────────────────────────┤
│ [ring+play] Listening…  🔊EN    │  Player row
│             12s left  0.75/1/1.25×│  Speed chips
├─────────────────────────────────┤
│ [Decisions when hasEnded]       │  Slide-down panel with Hide toggle
├─────────────────────────────────┤
│ paragraph text (scrolls)        │  bg-slate-50, auto-scrolls active
│ active sentence in yellow      │  sentence to center
└─────────────────────────────────┘
```

**Per-device user preferences (localStorage):**
- `st_text_size` — 20 / 22 / 24 px. Applied via inline `fontSize`. Default 22.
- `st_speed` — `0.75` / `1` / `1.25`. Applied via `audioRef.current.playbackRate`. Default 1.

`currentTime` on HTML5 `<audio>` is on the audio's own timeline, so playbackRate changes don't break sentence-highlight timing math.

**Behavioral details:**
- **Auto-scroll** — active sentence gets `scrollIntoView({behavior:'smooth', block:'center'})` on every `activeIndex` change. Child never scrolls manually.
- **Pulse on play** — `animate-ping` ring around play button until first tap of each paragraph.
- **Next-paragraph preload** — a hidden `<audio preload="auto">` loads the next paragraph's English audio while the current one plays, so `understood` → next is instant.
- **Language swap fade** — the paragraph container is keyed by `lang`, so React remounts with a `stFadeIn` keyframe on English → Hinglish.
- **Hide/Show decisions** — after audio ends, kid can tap "▲ Hide — just let me read" to collapse the decision panel into a slim "▼ Show options" bar so they can quietly re-read the paragraph before choosing.
- **Aborted attempts** — unmount-writer inserts a `('aborted', choice_made=null)` row if the child navigates away without pressing any decision button (same pattern as WFSession's `abortSnapshotRef`).
- **Audio load failures** — 2 automatic retries with backoff (1s, 3s), then a friendly "Slow internet?" retry card. Each failure logs to `storyteller_errors`.

**Resume policy:** stories always **start from paragraph 1** on re-entry (no cross-session resume state). "Story completed" is derived from attempts, not stored.

---

## 6. Scoring & Assessment (Phase 2, not built)

Design is locked; see the plan file `C:\Users\surya\.claude\plans\docs-games-09-story-weaver-md-read-this-swirling-raccoon.md` for full detail. Quick summary of what's committed:

- **Gemini output schema (9 fields):** `transcript` (verbatim), `word_count_total`, `unique_english`, `unique_hindi`, `relevance_band` (0-3), `coverage_band` (0-3), `beats_covered` (author-defined beat ids), `positive_note`, `next_step`.
- **Score formula (0-100):**
  ```
  if relevance_band == 0:  final = 0
  else:
    quality_pct = (relevance_band + coverage_band) / 6
    vocab_raw   = unique_english * 2 + unique_hindi
    vocab_pct   = min(vocab_raw, VOCAB_CAP) / VOCAB_CAP  # VOCAB_CAP=50
    final       = round((quality_pct * 0.7 + vocab_pct * 0.3) * 100)
  ```
  All words count (stop-word inclusive). Only `final` (0-100) goes to shared `game_score`.
- **Feedback tone rules:** praise first, one concrete stretch goal, never reveal missing plot, language of feedback matches or is one step more English than child's speech.
- **Case matrix (8 cases):** strong-EN / strong-HI / balanced / partial / too-short / off-topic / gibberish / silence — each with a scripted response pattern in the Gemini system prompt.
- **Feedback delivery:** TTS spoken warmly + text card + counts dashboard. Text always shown (fallback if speaker muted).
- **Edge functions to build:** `st_review_recording`, `st_finalize_summary` (server-side score recomputation is mandatory), `st_answer_question`.
- **Typed fallback:** if mic unavailable, textarea appears; same scoring pipeline; `input_mode='typed'`.
- **Q&A:** 2 voice questions max per (student, step), story-grounded system prompt, no scoring contribution in MVP.

**Author-defined `key_beats`** are the critical Phase 2 input. Each story needs 3–5 beats in `storyteller_sessions.key_beats` (JSONB array of `{id, text}`). Adds authoring burden, but makes `coverage_band` objective (Gemini answers yes/no per beat rather than free-forming).

---

## 7. Verification playbook (Phase 1 — SHIPPED)

1. Migration applied — 3 tables + RLS live in project `xlqnueqyqesfqwkbpwud`.
2. Reference seed run — `games.key='story_teller'` present.
3. Content seed run — 3 rows in `storyteller_sessions` for Nina Cycle, 6 MP3s in `game-assets/storyteller/` (EN + HI × 3 sessions).
4. UI walkthrough (any authenticated student):
   - `/student/games` → Story Teller card (📖) visible and clickable.
   - Hub shows "How Nina Learned to Ride a Cycle" under Alpha.
   - Tap → session paragraph 1 loads.
   - Tap ▶ → audio plays, yellow highlight follows sentence-by-sentence, ring fills.
   - Try speed chips: audio slows/speeds, highlight stays in sync.
   - Try text-size chips: paragraph reflows.
   - Seek in the audio: highlight resyncs.
   - Let audio end → decisions slide down from top.
   - Tap "▲ Hide" → decisions collapse, "▼ Show options" bar appears; text has more room.
   - Tap "🤝 Hinglish mein sunna hai" → text/audio swap to Hinglish with fade; button hides.
   - Tap "🔄 Read this paragraph again" → English restarts.
   - Tap "✓ I understood…" → advances to paragraph 2, then 3, then complete screen.
5. `SELECT * FROM storyteller_attempts WHERE student_id = auth.uid()` — one row per click, `attempt_status='completed'` (or `'aborted', choice_made=null` if the tab was closed mid-paragraph).

---

## 8. What's next (Phase 2 scope)

In rough priority order:
1. **`key_beats` authoring for the Nina story** — three beats: `{b1: greedy lion demands...}` etc. (Nina story specifically: setup, first fall, first successful ride.)
2. **Migration for `storyteller_summaries` + `storyteller_qna`** and the `game_score` bubble-up trigger.
3. **STT provider** (Google Cloud Speech-to-Text with `en-IN,hi-IN` code-switch config) wired into an edge function.
4. **Edge functions** `st_review_recording`, `st_finalize_summary`, `st_answer_question`. Server-side score recomputation is mandatory (never trust client `final_score`).
5. **`STAssessment.jsx`** — recording UI (Web Audio API silence detection + duration cap) + feedback review card + submit. Typed fallback for missing mic.
6. **`STQnA.jsx`** — 2-question voice interaction.
7. **Score screen** with previous-attempt delta ("your score went from 60 to 78").
8. **`game_skill_weights` seed rows** for storyteller × each level × (reading, listening, speaking).

Then optional Phase 3 polish: story cover artwork, cross-session progress resume, per-story-attempts cap, admin authoring UI.
