# EduVoice LMS

A mobile-first K-12 English-learning platform for Indian classrooms. Students submit text, image, and voice responses to teacher assignments — voice is auto-transcribed on-device and cross-checked by a server failsafe. On top of that sits a **Games** feature: self-study, mastery-driven English games grounded in second-language-acquisition theory. Assignment word counts and game points flow into a shared weekly / monthly leaderboard and badge system.

Every route renders inside a fixed 375×812 phone frame — the app is designed for mobile.

---

## Pedagogical principles

Every game and every level in EduVoice is traceable back to one of **seven SLA (second-language acquisition) pillars**. If a design cannot be justified by at least one pillar, it does not ship. Full theoretical treatment in [`docs/games/01-theory.md`](./docs/games/01-theory.md).

| # | Pillar | Source | What it means in the app |
|---|---|---|---|
| 1 | **Comprehensible Input at ZPD** (`i+1`) | Krashen 1985 · Vygotsky 1978 · CEFR 2001/2020 | Content is CEFR-tagged (A1–B2). Level (Alpha/Beta/Gamma) picks the band; steps ramp inside it. Adaptive scaffolding nudges "try easier" or "skip ahead" from mastery signal. |
| 2 | **Pushed Output** | Swain 1985, 2005 | Voice games are the highest-value class. Transcripts are always shown back so the *noticing* gap is visible. Recognition alone cannot unlock advanced levels. |
| 3 | **Interaction / Negotiation of Meaning** | Long 1996, 2015 | Feedback uses **recasts**, never red X marks. *"You said X — try Y"* over *"Wrong."* |
| 4 | **Distributed Practice with Spaced Retrieval** | Ebbinghaus 1885 → Leitner → SM-2 → Nation 2013 | Per-student vocabulary state with expanding-interval review. Words re-surface across games at 1d → 3d → 7d → 21d → 60d. Level unlocks require practice spread across multiple days. |
| 5 | **L1 Translanguaging** (Cummins Interdependence) | Cummins 1979, 2007 | Hindi hints available on demand at Alpha (long-press a tile). L1 scaffolding auto-fades: heavy at Alpha, occasional at Beta, absent at Gamma. |
| 6 | **Dual Coding** | Paivio 1971, 1986 | New Alpha vocabulary presents **written word + image + spoken audio** together. Images fade at Beta, absent at Gamma. |
| 7 | **Affective Filter + Self-Determination** | Krashen 1982 · Deci & Ryan 1985, 2000 | Autonomy (Free Play always open), Competence (early Alpha steps near-guaranteed wins), Relatedness (encouraging mascot copy). Zero-penalty exploration; lenient streaks with weekly freeze. |

Supporting (not pillars, but justifying implementation shape):

- **Systematic phonics** — for L1-Devanagari learners whose decoding intuitions actively mislead in English. Lives inside Read Aloud and Say It Right.
- **Skill Acquisition Theory** (DeKeyser 2007) — justifies the 10-steps-per-level structure: automatization needs volume and gradual ramps.

---

## Stack

- **Frontend:** React 18, Vite 5, React Router 6, Tailwind CSS 3, `@supabase/supabase-js` 2.45
- **Backend:** Supabase Postgres 17, Supabase Auth, Supabase Storage, Deno edge functions
- **Transcription:** Web Speech API (live, client-side) as primary; OpenAI Whisper via a 30-min scheduled edge function as failsafe
- **Games AI:** Google Gemini (Story Teller live proxy + analysis)
- **Hosting:** Vercel (frontend), Supabase managed (backend), `pg_cron` for scheduled jobs

## Roles

| Role | Login | How created |
|---|---|---|
| Student | phone number (mapped to synthetic email) | Self-signup, active immediately |
| Teacher | email + password | Self-signup (3-step: details → email OTP → password), approved per-school by principal |
| Principal | email + password | Provisioned directly in DB |
| Super admin | email + password | Provisioned directly in DB |

Enrollment is **class-based**: each student has one `class` integer (1–12). Courses and assignments target classes (via junction tables), not individual students.

---

## Features

### Assignments (live)
- Teachers create courses and assignments targeting one or more classes at their school.
- Students respond via text, image, or voice.
- Voice is transcribed in-browser during recording (Web Speech API) and cross-checked by the `whisper-failsafe` edge function every 30 minutes.
- Word counts feed the leaderboard: `total_words × 1 + unique_words × 3 + teacher_score_total + game_points_total`.

### Games (MVP-1, live)
Three of eight planned games shipped:

| Game | Route | Status |
|---|---|---|
| **Word Family** (Alpha) | `/student/games/word-family` | Live. Physics-driven "bubble mode" play surface; 60 authored sessions across 3 story arcs (Farm, Mela, Monsoon). |
| **Sentence Builder** (Alpha Steps 1–2) | `/student/games/sentence-builder` | Live. Three mechanics: narrate / flash / recast. |
| **Story Teller** (Alpha, Phase 1) | `/student/games/story-teller` | Live: reading + karaoke + Hinglish swap. Phase 2 (Gemini-assessed Q&A) in progress. |

**Planned:** Read Aloud, Say It Right, Talk Back, Story Listen, Bonus Q&A live.

**Cross-cutting game systems:**
- Per-student vocabulary + skill mastery state (EWMA formula, α = 0.15) across 7 tracked skills.
- No step or level gating — kids can play anything, any time. `frontierStep` is a hint, not a lock.
- Points: **+3** for completion, **+5** if correct — universal across games — automatically fold into weekly/monthly rank.

### Leaderboard & badges
- Weekly + monthly ranks sealed nightly at 00:05 UTC by `pg_cron` job `nightly-leaderboard-seal`.
- Top-5 badges awarded on Mondays (weekly) and the 1st of the month (monthly).
- Streaks (weekly + monthly) count both assignment submissions and game plays; lenient (1 freeze per week auto-applied).

---

## Getting started

### Prerequisites
- Node.js 18+
- A Supabase project (URL + anon key)
- Supabase CLI (optional, for local edge-function development and migrations)

### 1. Install
```bash
git clone https://github.com/<your-org>/eduvoice-lms.git
cd eduvoice-lms
npm install
```

### 2. Environment
Create a `.env` in the project root:
```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

For scripts and edge functions you may also need:
```env
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
OPENAI_API_KEY=<your-openai-key>
GEMINI_API_KEY=<your-gemini-key>
```

### 3. Dev server
```bash
npm run dev
```

### 4. Production build
```bash
npm run build
npm run preview
```

---

## Available scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run seed:reference` | Seed reference data (skills, levels, games) |
| `npm run seed:storyteller` | Seed Story Teller content |
| `npm run tts:lab` | TTS experimentation |
| `npm run test:sb-scoring` | Sentence Builder scoring tests |

---

## Project structure

```
src/
  components/         Shared UI (PhoneFrame, BackButton, StudentBottomNav, game components)
    games/            Bubble physics, tile grid, mastery bars, SB mechanic bodies, Story Teller UI
  lib/
    supabase.js       Client
    useAuthProfile.js Session + role gate
    games/            wfScoring, sbScoring, useWfSession, wfComplete, useSTGeminiLive, ...
  pages/              Route components (student/teacher/principal/games)
  App.jsx             Route table (all routes public; access control in each page)
  main.jsx            Entry point

supabase/
  functions/          Deno edge functions (whisper-failsafe, st_bonus_analyze, st_bonus_live_proxy)
  migrations/         SQL migrations (games schema, RPC rewrites, SB seed)
  live-schema.sql     Authoritative reference of the live database

docs/                 Architecture, schema, flows, scoring, security, known issues
  games/              Theory, taxonomy, product decisions, per-game specs
scripts/              Seeders, TTS lab, scoring tests
```

---

## Documentation

Detailed docs in [`docs/`](./docs):

**App:**
- [Overview](./docs/00-overview.md)
- [Database schema](./docs/01-database-schema.md)
- [Database functions](./docs/02-database-functions.md)
- [Edge functions](./docs/03-edge-functions.md)
- [Auth and roles](./docs/04-auth-and-roles.md)
- [Student flows](./docs/05-student-flows.md) · [Teacher flows](./docs/06-teacher-flows.md) · [Principal flows](./docs/07-principal-flows.md)
- [Scoring and leaderboard](./docs/08-scoring-and-leaderboard.md)
- [Security and risks](./docs/09-security-and-risks.md)
- [Known issues and drift](./docs/10-known-issues-and-drift.md)

**Games:**
- [Current status](./docs/games/00-current-status.md) — start here for the games feature
- [Theory — 7 SLA pillars](./docs/games/01-theory.md)
- [Taxonomy — games / levels / steps / skills](./docs/games/02-taxonomy.md)
- [Product decisions](./docs/games/03-product-decisions.md)
- [Data model](./docs/games/04-data-model.md)
- [Word Family](./docs/games/05-word-family.md) · [Sentence Builder](./docs/games/06-sentence-builder.md) · [Story Teller](./docs/games/07-story-teller.md)

---

## Deployment

- **Frontend:** Vercel (see `vercel.json`). Push to production branch → auto-deploy. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel.
- **Edge functions:**
  ```bash
  supabase functions deploy whisper-failsafe
  supabase functions deploy st_bonus_analyze
  supabase functions deploy st_bonus_live_proxy
  ```
- **Scheduled jobs** (already running in production):
  - `audio-failsafe-check` — every 30 min, calls `whisper-failsafe`
  - `nightly-leaderboard-seal` — `5 0 * * *` UTC, calls `run_leaderboard_seal()`

---

## Security notes

Row Level Security is currently **disabled** on all tables in `public`. Access control is enforced **client-side** in React components using the anon key that ships in the client bundle. Anyone with that key can bypass every check by calling the Supabase REST API directly. See [`docs/09-security-and-risks.md`](./docs/09-security-and-risks.md) for the full audit. **Do not use as-is for anything with sensitive personal data until RLS is enabled.**

## License

Private / proprietary. All rights reserved.
