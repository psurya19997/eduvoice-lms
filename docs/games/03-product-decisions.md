# EduVoice Games — Product Decisions (Locked)

## Positioning

- **Target audience:** beginner → mid-level English learners, ages 6-13+.
- **Mastery-driven, not class-driven** — a Class 3 and a Class 10 student see the same games. Difficulty adapts by mastery, not by grade.
- **Content is tone-neutral** — L1 items work across ages (avoid cartoon-baby styling that alienates older learners).

## Games are self-study (Path A)

- Not assignable by teachers.
- Complements the existing assignment system; does not replace it.
- Teacher analytics view is planned as future work.

## Home page entry

- Prominent **hero card** on `StudentDashboard.jsx`.
- Shows: Today's Quest availability + current streak indicator.
- Tap → Games Hub.

## Games Hub — two tabs

- **Tab 1: Today's Quest** — 3 recommended sessions for today.
- **Tab 2: Game Zone** — grid of all 8 game cards.

Each Game Zone card shows: icon, name, current level (Alpha / Beta / Gamma or 🔒), mastery indicator. Locked cards show what's needed to unlock.

## Today's Quest — recommender (MVP)

- Pick 1: game whose primary skill is student's weakest.
- Pick 2: game whose primary skill is student's strongest (motivation reward).
- Pick 3: game not played in the last 3 days.
- Never repeat a game in the same day's Quest.

## Streak — badge-based, not a games-only feature

- No separate daily streak system for games. The earlier Duolingo-style 🔥 chip and `student_streak` table proposal were dropped.
- Streaks are surfaced only on the existing `/student/badges` page via the `weekly_streak` / `monthly_streak` badges.
- Since the streak-cleanup change, those two badge counts include **any activity** in a week/month — a submission OR a game play — computed client-side in [StudentBadges.jsx](../../src/pages/StudentBadges.jsx).
- No freeze mechanic; no punitive reset — a badge just counts unique active weeks/months.

## Autonomy preserved

- Free Play (Game Zone) is always accessible alongside Today's Quest.
- Student can ignore Quest recommendations entirely.

## Data logged per session (game_attempts table)

- game_key, level, step, session_number
- score (0-100)
- duration_ms
- content_ids shown
- transcript (voice games)
- skill contributions (denormalized for teacher analytics)
