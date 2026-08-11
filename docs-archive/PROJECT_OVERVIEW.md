# EduVoice LMS — Project Overview

Mobile-first LMS where students submit text/image/audio responses to teacher assignments. Audio is transcribed (Whisper). Scores roll up into weekly/monthly leaderboards. Principals manage schools, teachers, students.

---

## 1. Tech Stack

- **Frontend**: React 18.3 + Vite 5.4, React Router 6.26, Tailwind 3.4
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **Edge runtime**: Deno (TypeScript)
- **Transcription**: OpenAI Whisper API + Web Speech API (live, client-side)
- **Deployment**: Vercel (SPA)
- **State**: React local state + custom hook `useAuthProfile`. No Redux.
- **UI shell**: All routes wrapped in `<PhoneFrame>` (375px mobile mock).
- **Env**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; backend `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

---

## 2. Data Schema (13 tables)

### Identity
- **schools** — `id, name (unique), is_active, require_teacher_approval`.
- **profiles** — one row per `auth.users`. `role ∈ {super_admin, principal, teacher, student}`. Students: `phone + school_id + class (1-12)`, no email. Staff: `email`, no phone/class. `is_active` gates login.
- **teacher_schools** — junction. `(teacher_id, school_id, is_approved, is_active)`. Teachers can teach at multiple schools; principal approves per school.

### Course/Assignment
- **courses** — `(teacher_id, school_id, title, description, is_active)`. Unique `(title, school_id)`.
- **course_classes** — junction. `(course_id, class)`. A course can target multiple grades.
- **assignments** — `(course_id, title, instructions, instruction_file_url, instruction_type, allowed_submission_types[], due_date, accept_late_submissions, teacher_score, is_live)`. `allowed_submission_types` must include ≥1 of `text/image/audio`.
- **assignment_classes** — junction `(assignment_id, class)`.

### Submission
- **submissions** — `(assignment_id, student_id, submission_type, text_content, file_url, transcript, total_words, unique_words, is_visible, submitted_at)`. Unique `(assignment_id, student_id)` — one per student per assignment, immutable.

### Scoring & Leaderboard
- **scores** — rolled-up per `(student_id, school_id, period_type, period_start)`. Holds `teacher_score_total, total_words, unique_words, total_score`.
- **leaderboard_weekly** — `(student_id, school_id, period_start (Monday), total_score, rank)`.
- **leaderboard_monthly** — same shape, `period_start = 1st of month`.
- **badges** — `(student_id, badge_type, count, last_earned_at)`. Types: `weekly_streak, monthly_streak, weekly_top5, monthly_top5`. Cumulative (never reset).

### Workflow
- **class_change_requests** — `(student_id, current_class, requested_class, status, requested_at, resolved_at)`. Only one `pending` per student (partial unique index).

### Storage buckets
- `submissions` (private) — student audio/image uploads.
- `assignment-briefs` (private) — teacher instruction media.

> **RLS**: policies are documented in schema but currently **disabled**. Auth gating happens client-side via `useAuthProfile`.

---

## 3. Backend Logic

### RPC: `recalculate_student_scores(p_submission_id)`
Called after every submission insert and after Whisper transcription. Recomputes the `scores` row for that student's period and refreshes `leaderboard_weekly` / `leaderboard_monthly` rank.

**Score formula** (per student, per period):
```
total_score = teacher_score_total
            + (total_words   × 1)
            + (unique_words  × 3)
```
- `teacher_score_total` = Σ `assignments.teacher_score` for submissions in period.
- `total_words` = Σ `submissions.total_words` in period.
- `unique_words` = COUNT(DISTINCT word) across all transcripts/text in period.

Period:
- Weekly → Monday of submission week.
- Monthly → 1st of submission month.

### Edge Function: `whisper-failsafe`
Cron-style background job (~30 min cadence). Finds `submissions` with `submission_type='audio'` AND `transcript IS NULL` AND `submitted_at < now() - 30 min`, then:
1. Downloads audio from `submissions` bucket.
2. Skips files < 100 bytes (corrupt).
3. Sends to OpenAI Whisper.
4. Replaces known hallucinations (`"Thank you"`, `"Subtitle by"`, `"Thanks for watching"`, `"Please subscribe"`) with `[No Speech Detected]`.
5. Writes `transcript` + `total_words`.
6. Calls `recalculate_student_scores`.

---

## 4. Roles & Auth

| Role | Login ID | Signup Flow |
|---|---|---|
| Student | phone (synthetic email `{phone}_{firstname}@students.eduvoice.app`) + password | direct signup, active immediately |
| Teacher | email + password | name/email/school → email OTP → set password → `teacher_schools.is_approved = false` until principal approves |
| Principal | email + password | (provisioned) |
| Super admin | email + password | (provisioned, frontend partial) |

**Gating**: `useAuthProfile(requireRole)` runs on every protected page — checks Supabase session, fetches `profiles`, redirects to `/login` if role mismatch or `is_active = false`. Unapproved teachers land on `/pending`.

---

## 5. Routes

**Public**: `/`, `/signup`, `/signup/teacher`, `/signup/teacher/verify`, `/signup/teacher/password`, `/signup/student`, `/login`, `/forgot-password`, `/pending`.

**Student** (`/student/*`): dashboard, `courses/:id`, `assignments/:id`, `assignments/:id/submit`, `leaderboard`, `badges`, `profile`.

**Teacher** (`/teacher/*`): dashboard, `courses/new`, `courses/:id`, `assignments/new?courseId=…`, `assignments/:id/submissions`, `profile`, `password`.

**Principal** (`/principal/*`): dashboard, `teachers`, `students`, `courses`, `requests`, `settings`.

---

## 6. Feature → Table Map

### Student

| Feature | Reads | Writes | Logic |
|---|---|---|---|
| Dashboard course list | `assignments` (is_live, class, school) ⨝ `courses` ⨝ `submissions` | — | Pending = assignments not in submissions for this student. Progress % = submitted / total. |
| Assignment detail | `assignments`, `assignment_classes`, `submissions` | — | Submit-CTA shown if not submitted AND (not overdue OR `accept_late_submissions`). |
| Submit (text) | `assignments` | `submissions` | `total_words` = wordcount of `text_content`. |
| Submit (image) | `assignments` | `submissions`, storage `submissions/` | File uploaded, `file_url` stored. |
| Submit (audio) | `assignments` | `submissions`, storage `submissions/` | Live Web Speech transcript captured client-side. Whisper failsafe overwrites if NULL. Max 3 min recording. After insert → RPC `recalculate_student_scores`. |
| Leaderboard | `leaderboard_weekly` / `leaderboard_monthly`, `scores` | — | Top 3 anonymized; own rank/score visible. Breakdown card uses formula above. Reset = next Monday / next 1st. |
| Badges | `submissions` (streak), `badges` (top5) | — | `weekly_streak` = COUNT DISTINCT weeks with ≥1 submission. `monthly_streak` similar. `*_top5` from `badges.count` (currently 0; not yet populated). |

### Teacher

| Feature | Reads | Writes |
|---|---|---|
| Dashboard | `teacher_schools` (approved+active), `courses`, `course_classes`, `assignments` | — |
| Create course | — | `courses`, `course_classes` (one per grade) |
| Create assignment | `course_classes` (limits target grades) | `assignments`, `assignment_classes`, storage `assignment-briefs/` (optional) |
| View submissions | `submissions` ⨝ `profiles` | — |
| School switcher | `teacher_schools` (is_approved AND is_active) | — |

### Principal

| Feature | Reads | Writes |
|---|---|---|
| Dashboard stats | `teacher_schools`, `courses`, `class_change_requests` | — |
| Approve/reject teacher | `teacher_schools` | `teacher_schools.is_approved`, `is_active` |
| Manage students | `profiles` (role=student, school) | `profiles.is_active` (disable also flips `submissions.is_visible`) |
| Manage courses | `courses`, `profiles` | `courses.is_active`, `courses.teacher_id` |
| Class change requests | `class_change_requests`, `profiles` | `class_change_requests.status/resolved_at`, `profiles.class` (on approve) |

---

## 7. Key Calculations Summary

- **Leaderboard score**: `teacher_score_total + total_words×1 + unique_words×3` — computed in `recalculate_student_scores` RPC, stored in `scores`, projected to `leaderboard_weekly/monthly`.
- **Course progress %** (student dashboard): `submitted_count / live_assignment_count_for_my_class`.
- **Assignment status** (student): `submitted` if row in `submissions`; else `overdue` if `now > due_date AND NOT accept_late_submissions`; else `open`.
- **Streak badges**: COUNT DISTINCT `date_trunc('week'/'month', submitted_at)` from `submissions` for that student.
- **Pending teacher count** (principal): `teacher_schools` where `is_approved=false AND school_id=current`.

---

## 8. Notable Constraints / Quirks

- One submission per (assignment, student) — enforced by unique index, no resubmits.
- Student `school_id` and `class` immutable via UI; class only changes through approved `class_change_requests`.
- Disabling a student (`is_active=false`) hides their submissions (`is_visible=false`) and blocks login.
- Disabling an assignment (`is_live=false`) hides it from students but preserves existing submissions.
- Whisper hallucination filter is hardcoded — review periodically.
- RLS off — relying on client-side gating + service role only in edge functions. Tighten before scaling.
- Badge `*_top5` types defined but not populated (no job writing them yet).

---

## 9. Components / Hooks

- `<PhoneFrame>`, `<BackButton>`, `<StudentBottomNav>`, `<TeacherBottomNav>`, `<PrincipalBottomNav>`, `<SchoolDropdown>`.
- `useAuthProfile(requireRole)` — auth + role gate + redirect.
- `studentSyntheticEmail(phone, firstName)` — deterministic email for student auth.
- `signupDraft` — localStorage helper for multi-step teacher signup.
