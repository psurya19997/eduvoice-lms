# Story Teller Phase 2 — Implementation Plan

**Companion to** `07-story-teller.md` (concept + data model + Phase 1 status).
**Purpose:** ship the assessment/practice/Q&A half of Story Teller. Phase 1 (reading + karaoke) is already live.

**Status (2026-08-10):** planning locked; migrations and edge functions not yet applied. No code written for Phase 2.

---

## What we're building

- **In-line & story-end practice items** — question / task / roleplay prompts authored per story, attached to a paragraph or to story-end. Child records audio, Gemini scores it against author-defined beats.
- **Bonus Q&A** — a Gemini Live conversation where the child can ask anything about the story. 3-min cumulative budget per story per student across attempts; +30s grace for winding down.
- **Async, resilient scoring** — every audio submission is processed by Gemini; if Gemini fails, retry inline 3× then in the background 5× at 10-min intervals. Both practice items and bonus Q&A produce `final_score` → shared `game_score` → leaderboard.

Full design reference: `07-story-teller.md` §§6, plus the discussion locked between 2026-08-08 and 2026-08-10 (schema + turn structure + wind-down mechanic + child-only word counts).

---

## Prerequisites (already live from Phase 1)

- Tables: `storyteller_sessions`, `storyteller_attempts`, `storyteller_errors`.
- Storage: `game-assets/storyteller/*.mp3` (paragraph audio, one per language per paragraph).
- Frontend: `STHub`, `STSession`, `STComplete`, `useSTAudio`, `stProgress`.
- Reference row: `games.key = 'story_teller'`.
- Env: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_TTS_API_KEY`.

Nothing above is disturbed by Phase 2; only new work is added.

---

## Locked design references (from discussion)

- **3 new tables:** `storyteller_practice_items`, `storyteller_practice_attempts`, `storyteller_bonus_attempts`.
- **ALTER `storyteller_sessions`:** drop unused `key_beats` + `max_summary_duration_seconds`; add `bonus_qna_cap_seconds int NOT NULL DEFAULT 180`.
- **`practice_items.content` shape varies by mode** (`question` / `task` / `roleplay`); every mode has `prompt` + `beats[]`. Roleplay adds `scene_setup` and `child_role`.
- **Gemini output schema** (fills `practice_attempts` on success): `transcript, word_count_total, unique_english, unique_hindi, relevance_band (0-3), coverage_band (0-3), beats_covered[], positive_note, next_step`.
- **Bonus Q&A cap is cumulative across attempts** (per student, per story). Timer = total clock time from Start. Cap → wind-down message → 30s grace → hard close.
- **Bonus Q&A also produces a score** post-session (relevance-based rather than beat-based), computed from child-only turns.
- **Feedback delivery = text + TTS in Wavenet-E** (same voice as story narrator). Not Gemini audio-out — voice consistency is the priority.
- **Error policy:** 3 inline retries + 5 backend retries (10-min interval) for Gemini API errors; client-side network → save pending, retry on next app open.
- **Points threshold:** `final_score >= 50 → +5, else +3`. Chosen over the WF/SB "strict-100" pattern because young kids need partial-credit reward for engaging at all; 80 was too punishing in playtesting.
- **STT strategy:** Gemini audio-in (one call) — swap to Google Cloud STT + Gemini text if Hinglish transcription quality disappoints.
- **Child audio bucket:** new private `storyteller-audio-private` with signed URLs; kids' voices are not public.

Everything above is settled. Any change to this list forces a plan revision — surface early.

---

## Build sequence — 9 phases (2A → 2I)

Each phase is independently verifiable. Deliverables state what "done" means; verification is the manual check that unblocks the next phase.

### Phase 2A — Database migration + storage bucket

**Deliverable:** 3 tables + ALTER + 2 game_score triggers + RLS + private bucket, applied to live Supabase.

**Files:**
- `supabase/migrations/20260810000000_storyteller_phase2_schema.sql` — all DDL.
- (Storage bucket + policies created via Supabase Dashboard or migration — Supabase allows both.)

**Tasks:**
- [ ] `ALTER TABLE storyteller_sessions DROP COLUMN key_beats, DROP COLUMN max_summary_duration_seconds, ADD COLUMN bonus_qna_cap_seconds int NOT NULL DEFAULT 180`.
- [ ] `CREATE TABLE storyteller_practice_items` with content jsonb + partial unique indexes (inline vs story-end).
- [ ] `CREATE TABLE storyteller_practice_attempts` including pending/failed indexes for the retry worker.
- [ ] `CREATE TABLE storyteller_bonus_attempts` including pending-analysis index.
- [ ] Trigger fn `st_practice_bubble_score()` + trigger on `practice_attempts` UPDATE to `completed`.
- [ ] Trigger fn `st_bonus_bubble_score()` + trigger on `bonus_attempts` UPDATE to `analysis_status='analyzed'`.
- [ ] RLS: read active items; students insert/select/update own attempts; ALL on bonus_attempts own.
- [ ] New Storage bucket `storyteller-audio-private` (private). RLS: authenticated users can INSERT to a path prefixed with their `auth.uid()`; SELECT via signed URLs only (edge function).

**Verification:**
- Apply migration via Supabase MCP `apply_migration`.
- `list_tables` returns the 3 new tables.
- Run Phase 1 verification checklist (`07-story-teller.md` §7) — Nina story still plays fully with karaoke; nothing regressed by the ALTER.
- Insert one hand-crafted `practice_items` row (question mode, session_id=null, level=alpha, step=1) via SQL; confirm the row lands and passes RLS with a student's JWT.

---

### Phase 2B — Client audio recorder + private upload

**Deliverable:** reusable audio recording component that captures a WebM blob, uploads it to the private bucket, and inserts a `submitted_pending` row.

**Files:**
- `src/components/games/st/STAudioRecorder.jsx` — mic UI, level meter, countdown, submit.
- `src/lib/games/useSTRecorder.js` — MediaRecorder wrapper hook.
- `src/lib/games/stAudioUpload.js` — Supabase Storage upload + row insert.

**Tasks:**
- [ ] MediaRecorder-based hook. Handle: `getUserMedia` denied, unsupported browser (fallback to typed).
- [ ] Duration cap (from `practice_items.duration_cap_seconds`) with visible countdown chip; auto-stop.
- [ ] Volume meter using Web Audio API `AnalyserNode` so kid sees they're being heard.
- [ ] On Submit: upload blob to `storyteller-audio-private/<auth.uid()>/<attempt_id>.webm` (attempt_id generated client-side via `crypto.randomUUID()`).
- [ ] INSERT into `storyteller_practice_attempts` with `attempt_status='submitted_pending'`, `audio_url = <path>`, `audio_duration_ms`, `duration_ms`.
- [ ] Failure paths: upload fail → retain blob in memory, mark row `upload_pending`, background-retry once, then surface error.

**Verification:**
- Record a 10s clip on desktop Chrome → confirm `.webm` in the private bucket (via Supabase Dashboard → Storage) and one row in `storyteller_practice_attempts` with status `submitted_pending`.
- Deny mic → recorder shows fallback typed input.
- Hit auto-cap at 60s → recording stops, row inserted.

---

### Phase 2C — `st_review_recording` edge function + retry worker

**Deliverable:** edge function that reads a pending attempt, calls Gemini with the audio + prompt + beats, and updates the row. A cron-driven worker retries failed rows.

**Files:**
- `supabase/functions/st_review_recording/index.ts` — the one-shot analyzer.
- `supabase/functions/st_review_worker/index.ts` — batch processor called by pg_cron.
- `supabase/migrations/20260810000010_storyteller_pgcron_workers.sql` — schedule pg_cron.

**Tasks:**
- [ ] `st_review_recording` reads `(attempt_id)` param → fetches attempt + joined item.content → generates a signed URL for the audio → calls `gemini-2.5-flash` with `{contents: [audio_part, prompt_part]}` and `responseSchema` matching the 9-field structure.
- [ ] Prompt template (in the function): system instructions for role/tone; user message includes the item's `prompt`, `beats[]`, and the audio.
- [ ] Response schema pins keys and types; strict mode.
- [ ] Compute `final_score` server-side from returned bands + vocab counts (see §Scoring below).
- [ ] UPDATE attempt with all fields, set `attempt_status='completed'`, `reviewed_at=now()`, `gemini_attempts += 1`. Insert triggers `game_score` (via existing trigger).
- [ ] On error: `gemini_attempts += 1`, `gemini_error = <msg>`, `attempt_status = 'submitted_pending'` if attempts < 3, `'failed'` otherwise. Inline retry: catch throw → sleep 500ms → retry (up to 3 total).
- [ ] `st_review_worker` selects rows where `attempt_status IN ('submitted_pending','failed') AND gemini_attempts < 8 AND submitted_at < now() - interval '10 minutes'`, calls `st_review_recording` for each (bounded batch size 20).
- [ ] pg_cron: `SELECT cron.schedule('st-review-worker', '*/10 * * * *', $$SELECT net.http_post(...)$$)` (uses `pg_net`).
- [ ] `no_speech` detection: if returned `word_count_total = 0`, set `attempt_status='no_speech'` instead of `completed`, `final_score=0`.

**Verification:**
- POST to `st_review_recording` with a real attempt_id (submitted via 2B). Row updates to `completed` with populated fields within 5s.
- Simulate a Gemini failure (invalid model name in secret) → attempt stays `submitted_pending` with `gemini_attempts=3` → wait 10 min → cron kicks in → retries → eventually `failed`.
- Submit a silent recording (empty room) → row lands as `no_speech`, `final_score=0`.

---

### Phase 2D — Feedback delivery (TTS in Wavenet-E)

**Deliverable:** frontend component that polls a pending attempt, then displays feedback text + auto-plays TTS'd audio.

**Files:**
- `src/components/games/st/STFeedbackCard.jsx` — visual card (positive_note, next_step, counts dashboard).
- `src/lib/games/stFeedbackTTS.js` — client wrapper for the TTS edge function.
- `supabase/functions/st_tts_feedback/index.ts` — takes text, returns MP3 (uses same Wavenet-E config as seed pipeline).

**Tasks:**
- [ ] Client polls attempt row (2s interval, up to 30s) while status is `submitted_pending`. Show "listening to your answer…" state during poll.
- [ ] When status flips to `completed` → render `STFeedbackCard` with fields.
- [ ] Client calls `st_tts_feedback` with `positive_note + " " + next_step` → receives MP3 blob → auto-plays.
- [ ] TTS edge function config: same as seed pipeline (`en-IN-Wavenet-E`, speed 0.9 for feedback since it's shorter than story text).
- [ ] Failure states: if attempt is `failed` after 30s poll → "come back soon" state; poll gives up. If attempt is `no_speech` → "we couldn't hear you — try again" state.

**Verification:**
- Submit an attempt → wait → feedback card renders → same warm voice as story reads the feedback aloud.
- Kill network before Gemini responds → feedback card shows "come back soon" state.

---

### Phase 2E — Practice item screen + integration into STSession

**Deliverable:** a practice screen that renders any item mode; STSession detects items and interleaves them at the right moment.

**Files:**
- `src/pages/STPractice.jsx` — full-screen prompt + recorder + submit + feedback.
- `src/lib/games/useSTPracticeFlow.js` — hook that queries items for the current session/story, tracks completion.
- (Modify) `src/pages/STSession.jsx` — on "understood" click, if items exist for this session, navigate to STPractice for each before advancing.
- (Modify) `src/pages/STComplete.jsx` — after story-end practice items, transition to bonus Q&A screen (Phase 2F).

**Tasks:**
- [ ] `useSTPracticeFlow` — queries `storyteller_practice_items` per §Feature 1/2 in `07-story-teller.md`.
- [ ] STPractice renders the prompt (mode-specific presentation), scene_setup / child_role for roleplay.
- [ ] Wires `STAudioRecorder` → upload → `st_review_recording` invocation → `STFeedbackCard`.
- [ ] After feedback, kid taps "Continue" → next item OR back to STSession for next paragraph.
- [ ] Router: `/student/games/storyteller/practice?item=<uuid>` (allows resume/deep-link).
- [ ] STSession dispatch: on `handleUnderstood`, check items for current `session_id`; if any incomplete, navigate to practice route with the first item.
- [ ] After story-end items complete, navigate to `/student/games/storyteller/bonus?...` (Phase 2F) OR straight to `/complete` if bonus is disabled for this story.

**Verification:**
- Nina story with seeded story-end task: play through 3 paragraphs → land on STPractice → record answer → see feedback → tap Continue → land on STComplete.
- Add an inline item after paragraph 2 via SQL: replay story → after paragraph 2, land on STPractice; complete it; return to paragraph 3.

---

### Phase 2F — Bonus Q&A: Gemini Live client + proxy

**Deliverable:** `STBonus.jsx` opens a Gemini Live conversation via an edge-function WebSocket proxy; timer enforces cap; turns are logged.

**Files:**
- `src/pages/STBonus.jsx` — remaining-time display, Start button, conversation view.
- `src/lib/games/useSTGeminiLive.js` — client-side WebSocket state machine.
- `supabase/functions/st_bonus_live_proxy/index.ts` — Deno WebSocket relay between client and Gemini Live (keeps API key server-side).

**Tasks:**
- [ ] On mount: query remaining_ms (see §Feature 7 query in `07-story-teller.md`). If `<= 0` → show "You've used all your time" state + link back to hub.
- [ ] Start button → INSERT into `storyteller_bonus_attempts` (`attempt_order = MAX+1`, `talk_time_ms=0`, `turns=[]`, `ended_reason=NULL`, `started_at=now()`, `analysis_status='pending'`); open WebSocket to proxy.
- [ ] Proxy opens Gemini Live session with system prompt: story text + role instructions + wind-down clause.
- [ ] Bidirectional streaming: client mic → proxy → Gemini; Gemini audio → proxy → client speaker.
- [ ] Client accumulates `turns[]` from each event (child utterance transcript, Gemini utterance transcript + audio URL if we persist Gemini voice).
- [ ] Timer top-bar counts total elapsed. At `remaining - 30s` → push updated system prompt with wind-down instructions (Gemini Live supports mid-session prompt updates). At `remaining = 0` → close WebSocket, `ended_reason = 'cap_reached'`.
- [ ] Stop button → close WebSocket, `ended_reason = 'child_ended'`.
- [ ] Navigation-away → cleanup effect writes `ended_reason = 'aborted'` with whatever's been collected.
- [ ] UPDATE row on close with final `turns`, `talk_time_ms`, `ended_reason`, `ended_at`. Fire `st_bonus_analyze` (Phase 2G) via edge fn invoke.

**Verification:**
- Kid clicks Start → Gemini greets → back-and-forth for 1 min → click Stop → row shows `talk_time_ms≈60000`, `ended_reason='child_ended'`, `turns[]` has ~4-8 entries.
- Kid returns → remaining shows ~120s → tap Start → attempt_order=2 → chat until cap → row shows `ended_reason='cap_reached'`.
- Kill network mid-conversation → attempt row still updates with `ended_reason='error'` and whatever turns were captured.

---

### Phase 2G — Bonus Q&A analysis edge function

**Deliverable:** post-session analyzer that extracts child-only speech, calls Gemini text for scoring, writes analysis fields → triggers `game_score`.

**Files:**
- `supabase/functions/st_bonus_analyze/index.ts` — the analyzer.
- (Reuse) `st_review_worker` cron for the pending-analysis backlog OR create `st_bonus_worker`.

**Tasks:**
- [ ] Fetch `bonus_attempts` row by ID → filter turns to `role='child'` → concatenate text → build analysis prompt (story text + rules for Q&A scoring).
- [ ] Call `gemini-2.5-flash` (text) with `responseSchema` for the 9-ish fields (transcript verbatim, word_count_total, unique_english, unique_hindi, relevance_band, positive_note, next_step). No coverage_band (bonus Q&A has no beats).
- [ ] Compute `final_score` per formula (see §Scoring below).
- [ ] UPDATE row: `analysis_status='analyzed'`, `analyzed_at=now()`, all analysis fields populated. Trigger fires → `game_score` insert.
- [ ] Same retry policy (3 inline + 5 backend). Failures set `analysis_status='failed'`.
- [ ] Extend cron worker (or add second worker) to sweep `bonus_attempts` where `analysis_status IN ('pending','failed') AND analysis_attempts < 8 AND ended_at < now() - interval '10 min'`.

**Verification:**
- End a bonus session → within ~5s, `analysis_status='analyzed'` and `final_score` populated → `game_score` has a matching row.
- Force Gemini failure → row goes through inline retries → eventually `failed` → cron picks up → succeeds on retry.

---

### Phase 2H — Content seeding for Nina story

**Deliverable:** at least 1 story-end task + 1 inline question authored for Nina so verification can happen end-to-end.

**Files:**
- `supabase/migrations/20260810000020_storyteller_nina_practice_items.sql`

**Tasks:**
- [ ] Story-end **task** (mode='task', session_id=NULL): *"Tell the whole story in your own words."* Beats:
  - `b1: Nina wanted to learn to ride a cycle`
  - `b2: she fell but Papa encouraged her`
  - `b3: she succeeded and dreamed of school`
- [ ] Optional inline **question** after paragraph 2: *"How did Nina feel when she fell down?"* Beats:
  - `b1: she felt scared or hurt`
  - `b2: she wanted to cry`
- [ ] Optional inline **roleplay** after paragraph 2: *"You are Nina. Papa asked 'Beta, kya hua?' — tell him what happened."* with child_role, scene_setup, and 2 beats.

**Verification:** rows visible in `storyteller_practice_items`; frontend queries return them for the Nina story.

---

### Phase 2I — End-to-end verification

**Deliverable:** every checklist item passes on a real student account.

**Tasks:**
- [ ] Fresh student plays Nina story through paragraph 1 → 2 → practice question after 2 → 3 → story-end task → bonus Q&A → complete screen.
- [ ] Each practice submission produces a `completed` attempt row with populated Gemini fields within 5s.
- [ ] Feedback plays in the same voice as the story narration.
- [ ] `game_score` gains one row per completed practice attempt and one per analyzed bonus attempt.
- [ ] `sum(game_score.points)` visible in the header pill increments correctly.
- [ ] Leaderboard shows the student's new score.
- [ ] Kill network before submitting practice audio → attempt row lands as `submitted_pending`; reopens the story; row eventually completes; feedback available.
- [ ] Kill network mid-bonus-live → attempt row saved as `error` with partial turns.
- [ ] Kid uses all 3 min across 2 attempts → 3rd attempt Start button disabled with "You've used all your time" message.

---

## Scoring formulas (server-side, in edge functions)

Locked shape; the constants are tunable in one place per formula.

**Practice attempts** (all modes use the same formula since they share beats):
```
if relevance_band == 0:  final = 0
else:
  quality_pct  = (relevance_band + coverage_band) / 6
  vocab_raw    = unique_english * 2 + unique_hindi
  vocab_pct    = min(vocab_raw, 50) / 50
  final        = round((quality_pct * 0.7 + vocab_pct * 0.3) * 100)
```

**Bonus Q&A** (no beats):
```
if relevance_band == 0:  final = 0
else:
  engagement_pct = relevance_band / 3
  vocab_raw      = unique_english * 2 + unique_hindi
  vocab_pct      = min(vocab_raw, 50) / 50
  final          = round((engagement_pct * 0.4 + vocab_pct * 0.6) * 100)
```

**Points to `game_score`:** `final_score >= 80 ? 5 : 3`.

Tuning happens in the edge function constants — no schema change ever needed.

---

## Cross-phase regression checks (run at every phase end)

- Phase 1 Nina story still plays end to end (paragraphs, highlight, decisions, complete).
- Word Family and Sentence Builder unaffected (no shared code paths touched).
- Leaderboard math still correct (new game rows folded into `scores.game_points_total` via existing `recalculate_student_scores` RPC).
- `storyteller_errors` still receives audio-load failures.

---

## Open decisions (want to confirm before Phase 2A applies)

1. **STT approach — Gemini audio-in (my rec) vs Google STT + Gemini text.** Affects `st_review_recording` skeleton.
2. **Private child-audio bucket vs public with obscure paths.** Affects storage RLS + signed-URL flow in feedback UI.
3. **Points threshold** — `final_score >= 80` for +5. Confirm.
4. **Retry worker infra** — pg_cron + pg_net (my rec) vs Vercel cron.
5. **Should Gemini's spoken audio in bonus Q&A be persisted** (uploaded to bucket for teacher review) or discarded post-session? Persisting doubles bucket cost per attempt.

None of the above block plan approval — they only need answers before Phase 2A/2C/2F respectively.

---

## Related docs

- `07-story-teller.md` — full concept + Phase 1 status + design references.
- `00-current-status.md` — overall games feature status; will need a 2026-XX-XX update line when Phase 2 ships.
- `04-data-model.md` — shared tables and universal rules for scoring/mastery/leaderboard.
- Plan-file scratch (not in repo): `C:\Users\surya\.claude\plans\docs-games-09-story-weaver-md-read-this-swirling-raccoon.md` — pre-schema design working notes.
