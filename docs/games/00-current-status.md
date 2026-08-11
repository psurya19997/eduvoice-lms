# EduVoice Games — Current Status & Handoff

**Read this first when starting a new session.**

---

## What EduVoice is

Mobile-first K-12 English-learning LMS on React + Vite + Supabase, deployed to Vercel. Kids submit assignments (text/image/voice); voice is auto-transcribed. See `docs/00-overview.md` for the full picture of the existing app.

## What we're building

A new **Games** feature — self-study English-learning games for beginner-to-mid learners (ages 6-13+). Mastery-driven (not age-gated). Feeds a shared weekly/monthly leaderboard and (later) teacher analytics.

MVP-1 targets **3 of 8 planned games**: Word Family, Sentence Builder, Read Aloud.

## Where we are RIGHT NOW

**Word Family Alpha, Sentence Builder Alpha, and Story Teller Alpha (Phase 1) are all live.**

> **2026-08-01 update — no more blocking.** All step and level gating has been removed across both games (any kid can play any step, any level, any time). The WF per-session 3-day cooldown is also gone. The `frontierStep` calculation still exists but only drives a visual "▶ Play" hint on the recommended next step — it is not a lock. See "Access & progression" under Locked decisions below.

> **2026-08-06 update — WF play surface is now bubble mode.** The static tile grid was replaced with a physics-driven floating-bubble surface. Scoring, session rotation, DB writes, mastery, and points are all unchanged — this is a presentation-layer change only. Full design + implementation spec is now the "Play surface — Bubble Mode" section inside `docs/games/05-word-family.md`.

> **2026-08-09 update — Story Teller Phase 1 (reading + karaoke + Hinglish swap) is live.** Assessment/Gemini/Q&A is Phase 2, not built. First seeded story: *How Nina Learned to Ride a Cycle*, Alpha Step 1, 3 paragraphs. Full spec: `docs/games/07-story-teller.md`.
>
> **2026-08-09 update — games docs consolidated: one file per game.** WF bubble-mode notes merged into `05-word-family.md`; SB implementation plan and content-authoring guidelines merged into `06-sentence-builder.md`; Story Teller renamed from `09-story-weaver.md` to `07-story-teller.md` to fill the numbering gap and match the current game name.

**Word Family**

- **Data layer** — all 9 shared/WF tables applied, reference data seeded, 60 V4 sessions authored across 3 narrative arcs (Farm, Mela, Monsoon/Festival) with English-only category names and bilingual Hindi support in hints and long-press tiles. Applied via Soft Replacement (50 old sessions deactivated via `is_active = false`).
- **Game logic** — `wfScoring`, `useWfSession` (LRU ordering: never-played first in curriculum order, then oldest-played), `wfComplete` (writes attempt + score + mastery + history + triggers leaderboard recalc).
- **UI** — single page at `/student/games/word-family`; 2-phase state machine (`play` / `outcome`); header carries compact `Vocab | Reading | ⚡points` + level progress bar + step-picker sheet; onboarding overlay on first visit; 15s auto-advance with `Next now` chip. Play surface is bubble mode (see next line); outcome shows the category prompt at the top, frozen bubbles re-colored by state, and info rows headed "Didn't fit (N)" / "You missed (N of TOTAL)".
- **Play surface (2026-08-06)** — `BubblePlayBody` renders capsule bubbles that drift, bounce off walls, and collide with each other in a physics area above a bucket strip. Touch-to-freeze, release-to-pop into the bucket; long-press for Hindi; tap a bucket chip to un-pick (bubble respawns at a collision-safe slot on the bucket edge). On Done, the parent calls `freezeAll()` synchronously, awaits `wfComplete`, then reads `snapshot()` (with a 24-iter separation pass so frozen bubbles never visually overlap) into the outcome view. See the "Play surface — Bubble Mode" section in `05-word-family.md` for full spec.
- **Leaderboard integration** — `recalculate_student_scores` was rewritten to take `p_student_id` directly and now includes a fourth `game_points_total` column on `scores`. Every completed WF session triggers a recalc → weekly/monthly rank + `weekly_top5`/`monthly_top5` badges automatically fold in game points.

**Sentence Builder**

- **Data layer** — SB schema applied (`sentence_builder_sessions`, `sentence_builder_attempts`, `game_characters`), reference seeded. Migrations on live in order: `20260731000001_sb_schema`, `20260731000002_sb_seed_reference`, `20260731000004_sb_demo_sessions` (Step 1), `20260731000006_sb_demo_sessions_step2` (Step 2). (000003 and 000005 do not exist — 000005 was a "fix" that turned out to be unnecessary and was deleted on 2026-08-01.)
- **Game logic** — `sbScoring` (slot-overlap best-match against `valid_sentences`, score = `((correct − wrong) / totalSlots) × 100`), `useSbSession` (frontier session by `session_order` within the picked step), `sbComplete` (attempt + score + mastery + history + leaderboard recalc; +5 correct / +3 otherwise, same as WF).
- **UI** — hub at `/student/games/sentence-builder`; session shell at `/play` delegates to one of three mechanic bodies (`NarrateBody`, `FlashBody`, `RecastBody`) depending on `session.mechanic`. Shared components in `components/games/sb/` (character portrait, speech bubble, sentence canvas, tile bank, chip tile, outcome).
- **Content** — Alpha Step 1 (`The Magic Balloon`, 5 recast sessions) and Alpha Step 2 (`Feed the Hungry Puppy!`, 5 narrate sessions) live. Alpha Steps 3–10 and all of Beta/Gamma not authored — the tiles show "Coming soon".

**Beta / Gamma content for both games** — not authored. With gating removed, the tabs are visible and tappable; the empty steps render "Coming soon".

## Files to read in order

| # | File | Purpose |
|---|---|---|
| 1 | `docs/games/01-theory.md` | 7 SLA theory pillars — the pedagogical foundation. Every design must trace back to one of these. |
| 2 | `docs/games/02-taxonomy.md` | Games / Levels / Steps / Sessions terminology + 7 tracked skills + skill-mapping weights. |
| 3 | `docs/games/03-product-decisions.md` | Product-shape decisions: Games hub with 2 tabs, Today's Quest, streak (lenient), autonomy. |
| 4 | `docs/games/04-data-model.md` | **All 7 shared tables** with schemas + universal rules (EWMA formula, attempt-status matrix, points rule). |
| 5 | `docs/games/05-word-family.md` | **Word Family (game doc)** — schema, score formula, gameplay UX, rotation logic. Includes the Bubble Play Mode section (physics engine, gesture handling, Done handoff, popped-body lifecycle, respawn placement, outcome layout). |
| 6 | `docs/games/06-sentence-builder.md` | **Sentence Builder (game doc)** — universal schema, mechanic-driven variants (narrate / flash / recast / grow), content design rules, variant blueprints. Includes Content Authoring Philosophy and Implementation Status (11 phases). |
| 7 | `docs/games/07-story-teller.md` | **Story Teller (game doc)** — concept, data model, TTS content pipeline, runtime UI (STHub / STSession / STComplete), Phase 2 assessment design (Gemini + Q&A). |
| 8 | `docs/games/08-story-teller-phase2-implementation.md` | **Story Teller Phase 2 implementation plan** — 9-phase build sequence (schema → recorder → Gemini → feedback → practice screen → bonus Q&A → analysis → content → verification), scoring formulas, open decisions. |
| 9 | This file (`00-current-status.md`) | Current status and next steps. |
| 10 | `docs/08-scoring-and-leaderboard.md` | How game points feed the weekly/monthly leaderboard. Updated for the games flow. |

For the existing app itself, always cross-reference `docs/00-overview.md` and the live Supabase schema in `supabase/live-schema.sql`.

## Locked decisions (this feature — cumulative)

### Data model
- **9 tables total for MVP-1:** 7 shared (`skills`, `levels`, `games`, `game_skill_weights`, `game_score`, `student_skill_mastery`, `student_skill_mastery_history`) + 2 Word Family-specific (`word_family_sessions`, `word_family_attempts`). All applied via `supabase/migrations/20260726000000_games_mvp1_schema.sql`.
- **All reference tables** use uuid PK + separate text key column.
- **Attempt statuses:** `completed` / `timeout` / `aborted` with different downstream effects (see `04-data-model.md` matrix).
- **Points:** 3 for completion, 5 if `is_correct`. Universal across games.
- **Score formula for WF:** `((correct − wrong) / total_targets) × 100`, clamped 0-100. Game-specific.
- **`is_correct` for WF:** score = 100 only (strict).
- **Skill mastery formula:** EWMA per correct pick, α = 0.15. Wrong picks skipped (mastery only grows).

### Access & progression
- **No step or level gating (both games, as of 2026-08-01).** Kids can play any step in any level at any time. Alpha/Beta/Gamma tabs are always tappable. The step grid never renders a "🔒 Locked" state. `sbProgress.js` sets `isLocked = false` unconditionally; `wfProgress.js` no longer computes a locked-future state.
- **`frontierStep` is a hint, not a lock.** It's still computed (SB: first session-not-completed; WF: highest step ever started) and highlighted on the hub tile with "▶ Play". Kids see a suggestion; they can override by tapping any other step.
- **No auto-redirect on explicit navigation.** `SBSession` and `WFSession` only auto-route to the frontier step when the URL has no explicit `?step=` param. If a kid explicitly picks a done or resting step from the hub or picker, they land there and see the appropriate exhausted screen instead of being bounced.

### Gameplay
- **WF session ordering:** LRU only — never-played sessions first in curriculum order (`created_at ASC`, tie preserved), then oldest-played last. **No 3-day cooldown.** Any session can be replayed immediately. Enforced client-side inside `src/lib/games/useWfSession.js`.
- **SB session ordering:** Strict linear by `session_order`. Frontier = first session in the picked step with no completed attempt. When all sessions in a step have a completed attempt, `useSbSession` returns `exhausted` and the "Step complete" screen shows.
- **Timer** — WF: internal only, no visible stopwatch. SB: `session.time_limit_seconds` drives a visible countdown chip when set (Alpha default 180s per session); on expiry the attempt writes with `attempt_status='timeout'`.
- **First-time onboarding** — WF: 3-step overlay on first-ever visit, dismiss to `localStorage['wf_onboarded_v1']`. SB: per-step intro overlay driven by `session.session_intro` (shown once on `session_order=1`, dismiss to `localStorage['sb_intro_${level}_${step}']`).
- **Post-outcome flow** — `Next now →` primary. WF also has an `Auto 15s ⏸` countdown chip.
- **Recast tone (Pillar 3)** — never "wrong", never red X. Wrong = soft amber; missed = pulsing blue; correct = green. English recast text; long-press tile for Hindi.
- **Exhausted-step message** — WF: `"No sessions in Step N · Coming soon"` (fires only when the step has zero authored sessions, since there's no longer a cooldown). SB: `"Step Complete!"` when all sessions in the step have a completed attempt.

### UI
- **Single page** — `/student/games/word-family` is the entire game (no separate step-select page). Two phases live in one component.
- **WF play surface = bubble mode.** Physics-driven floating capsules replace the earlier static tile grid. Tile grid components are still on disk (`Tile.jsx`, `TileGrid.jsx`) but only WF used them; kept for reuse. Full contract in the "Play surface — Bubble Mode" section of `05-word-family.md`.
- **Everything fits 400×812 viewport** — no scroll on Play; Outcome scrolls only when recasts overflow.
- **Mastery bars live only in the header strip** (compact) — NOT rendered on the outcome view, per user direction.
- **Level progress bar** — thin bar `▓▓▓░░░░░░░ Alpha 3/10` in header; step change via bottom-sheet picker (`Step 4 ▾`).
- **Running points chip** — `⚡ N` in header, sourced from `sum(game_score.points)`.
- **Streak** — no dedicated games streak chip. Streaks live only on the `/student/badges` page. As of the streak-cleanup change, both `weekly_streak` and `monthly_streak` counts include game_score activity in addition to submissions (activity = submission OR game play, computed client-side in [StudentBadges.jsx](../../src/pages/StudentBadges.jsx)).

### Leaderboard integration
- **`recalculate_student_scores(p_student_id uuid)`** — one function, called from `StudentAssignmentSubmit.jsx`, `whisper-failsafe` (v11), and `wfComplete.js`. School derived from `profiles`, not from a submission row.
- **`scores` now has `game_points_total int NOT NULL DEFAULT 0`** — backfilled from `game_score`. `total_score = teacher_score_total + total_words*1 + unique_words*3 + game_points_total`.
- **`update_all_leaderboard_ranks` and `award_badge_idempotent` unchanged** — they consume `scores` as-is, so game points automatically flow into `leaderboard_weekly`/`_monthly` rank and thus `weekly_top5`/`monthly_top5` badge eligibility.

### WF variants — history correction
- Prior notes said "Grammar-heavy variants don't update the Grammar mastery skill." **That is no longer true.** `game_skill_weights` now includes Grammar 0.10 for WF Beta and Gamma. Alpha stays Vocabulary 0.70 / Reading 0.30 (no Grammar). See `05-word-family.md` for the full weight table.

## What ships in code today

### Migrations (applied live in order)
1. `supabase/migrations/20260726000000_games_mvp1_schema.sql` — 9 tables, indexes, triggers.
2. `supabase/migrations/20260727000000_recalculate_scores_by_student_with_game_points.sql` — RPC rewrite (student-driven, adds game points to formula).
3. `supabase/migrations/20260727000001_scores_add_game_points_total.sql` — persist column + backfill from `game_score`.
4. `supabase/migrations/20260731000001_sb_schema.sql` — SB tables (`sentence_builder_sessions`, `sentence_builder_attempts`, `game_characters`), indexes, updated_at trigger.
5. `supabase/migrations/20260731000002_sb_seed_reference.sql` — SB reference seed (`games` row, `game_skill_weights` for SB, `game_characters`).
6. `supabase/migrations/20260731000004_sb_demo_sessions.sql` — Alpha Step 1 seed: 5 recast sessions of `The Magic Balloon`.
7. `supabase/migrations/20260731000006_sb_demo_sessions_step2.sql` — Alpha Step 2 seed: 5 narrate sessions of `Feed the Hungry Puppy!` (applied 2026-08-01; introduces the `context_setting` column in the seed template).

Numbering gaps: `20260731000003` and `20260731000005` do not exist — 000005 was a `_sb_fix_game_insert` migration that turned out unnecessary (the games row and Step 1 sessions were already correctly loaded by 000004) and was deleted on 2026-08-01.

### Seed data (applied live)
- **Reference:** `skills` (7), `levels` (3), `games` (`word_family` and `sentence_builder` both `is_active=true`; others inactive), `game_skill_weights` (WF: 8 rows across Alpha/Beta/Gamma; SB: seeded via 000002).
- **Word Family content:** 60 `word_family_sessions` (10 steps × 6 sessions each) — full India-centric V4 curriculum across 3 story arcs (Farm, Mela, Monsoon) with English-only category names and Hindi translations in hints/long-press. Old 50 sessions soft-replaced (`is_active = false`).
- **Sentence Builder content:** 10 `sentence_builder_sessions` — Alpha Step 1 (5 × recast, `The Magic Balloon`) and Alpha Step 2 (5 × narrate, `Feed the Hungry Puppy!`). Steps 3–10 and Beta/Gamma not authored.
- **JSON masters** kept at `supabase/seed/reference/` and `supabase/seed/sessions/word_family/alpha/` for version-controlled authorship.

### Frontend (all in `src/`)
- **Pages:** `pages/GamesHub.jsx`, `pages/WFHub.jsx`, `pages/WFSession.jsx`, `pages/SBHub.jsx`, `pages/SBSession.jsx`.
- **Shared game components:** `components/games/{Tile,TileGrid,MasteryBar}.jsx`. `Tile` and `TileGrid` are no longer used by Word Family (retained for reuse by future games).
- **WF bubble mode (2026-08-06):** `components/games/BubblePlayBody.jsx` (play-phase UI, pointer capture, drag/long-press handling, ResizeObserver, single fixed capsule width per session), `components/games/useBubblePhysics.js` (headless RAF hook — capsule–capsule collision with iterated pair+wall constraint pass, popped-body-preserving semantics, `freezeAll`/`snapshot`/`addBubble` with clearance-search respawn, snapshot separation relaxation, StrictMode-safe cleanup), `components/games/FrozenBubbles.jsx` (read-only outcome capsules at handed-off positions).
- **SB mechanic bodies:** `components/games/sb/{NarrateBody,FlashBody,RecastBody}.jsx` plus shared `CharacterPortrait`, `SpeechBubble`, `SentenceCanvas`, `TileBank`, `ChipTile`, `SBOutcome`.
- **Game logic (`lib/games/`):**
  - WF: `wfScoring.js`, `wfRefs.js` (cached reference IDs), `useWfSession.js` (LRU ordering, no cooldown), `wfComplete.js` (transaction-ish write cascade + triggers `recalculate_student_scores` RPC), `useMastery.js`, `wfProgress.js`.
  - SB: `sbScoring.js`, `useSbSession.js` (frontier by `session_order` within the picked step), `sbComplete.js` (attempt + score + mastery cascade), `sbProgress.js` (per-step done/total counts, no locking).
- **Wired in:** 5th tab "Games" on `StudentBottomNav.jsx`; Games hero card above "Your courses" on `StudentDashboard.jsx`; new `BreakdownRow` for Game points on `StudentLeaderboard.jsx`; empty-state copy updated to mention games.

### Backend
- **Edge function `whisper-failsafe` v11 deployed** — updated to call `recalculate_student_scores(p_student_id: sub.student_id)` after each transcript write. The 30-min cron `audio-failsafe-check` continues to invoke it.

## What's next

Waiting on user direction. Candidates in rough priority order (deferred but useful):

1. **Server-side RPC for atomic write** of (attempt + score + mastery + history) — currently sequential client-side writes, acceptable while RLS is off but a real risk if any middle write fails. Applies to both WF and SB.
2. **Replay-farming guardrail.** With cooldown and gating removed, a kid can grind Step 1 for +3/+5 per attempt with no throttle. If mastery/leaderboard signal degrades, the cheapest fix is a per-session daily attempt cap in `wfComplete.js` / `sbComplete.js` — no schema changes needed.
3. **Beta / Gamma content authoring** for both WF and SB.
4. **`category_name_hindi` column** on `word_family_sessions` for bilingual prompts.
5. **Today's Quest recommender** — currently a hard-coded single-card mock in `GamesHub.jsx`. The heuristic (weakest / strongest / variety) is straightforward once `student_skill_mastery` has real data.
6. **Read Aloud** — no design yet.
7. **Teacher analytics UI** — data already exists in `game_score` + `student_skill_mastery_history`.

## User's working preferences (important — respect these)

- **Discuss before writing** — even after plan approval, walk through specifics in chat before creating files or applying migrations. User has interrupted mid-write multiple times when this wasn't done.
- **Concise responses** — minimal text, tables and diagrams over prose. Ask focused questions, not exhaustive lists.
- **Confirm before applying to live Supabase** (project `xlqnueqyqesfqwkbpwud`). Migrations are shown as SQL in chat first.
- **Ask targeted clarifying questions** via `AskUserQuestion` when there's a real branching decision. Don't ask about direction/plan approval — for plan approval use ExitPlanMode.
- **Never write to files** without explicit permission or clearly agreed context.

## Live Supabase context

- Project ref: `xlqnueqyqesfqwkbpwud`
- Schema snapshot: `supabase/live-schema.sql` (source of truth for what exists in the DB today; kept in sync with live changes).
- Migrations directory: `supabase/migrations/` — 3 files, all applied.
- RLS is **disabled** on all tables — documented tech debt (`docs/09-security-and-risks.md`). Games tables inherit this; not blocked on it for MVP.

## Key existing code to reuse

- `src/components/PhoneFrame.jsx` — every game screen renders inside automatically via `App.jsx`.
- `src/components/BackButton.jsx` — game screen back-nav.
- `src/lib/useAuthProfile.js` — gate every game with `useAuthProfile('student')`.
- `src/lib/supabase.js` — DB client.
- `src/components/StudentBottomNav.jsx` — the 5-tab nav (Home / Games / Leaderboard / Badges / Profile).
- `src/pages/StudentDashboard.jsx` — home page with Games hero card at top.
- `src/pages/StudentAssignmentSubmit.jsx` — voice recording pipeline reference (relevant for Read Aloud later).
