-- ============================================================================
-- EduVoice LMS — Database Schema
-- Source: PRD v4.0 FINAL, Section 10 (Database Schema)
--
-- Notes:
--   * Primary keys use uuid + gen_random_uuid() (pgcrypto is enabled on
--     Supabase by default).
--   * Timestamps use timestamptz for timezone safety.
--   * Enum-style fields use CHECK constraints (simpler than CREATE TYPE,
--     easier to evolve).
--   * RLS is DISABLED for every table at the bottom of this file.
--     Policies will be written later when authentication flows are wired up.
--     See the "RLS POLICY NOTES" comment block above each table for intent.
--   * Drop order is reverse of create order to respect FKs.
-- ============================================================================

-- Extensions --------------------------------------------------------------
create extension if not exists pgcrypto;

-- Clean slate (safe to re-run during development) -------------------------
drop table if exists public.badges cascade;
drop table if exists public.class_change_requests cascade;
drop table if exists public.leaderboard_monthly cascade;
drop table if exists public.leaderboard_weekly cascade;
drop table if exists public.scores cascade;
drop table if exists public.submissions cascade;
drop table if exists public.assignment_classes cascade;
drop table if exists public.assignments cascade;
drop table if exists public.course_classes cascade;
drop table if exists public.courses cascade;
drop table if exists public.teacher_schools cascade;
drop table if exists public.profiles cascade;
drop table if exists public.schools cascade;


-- ============================================================================
-- 1. schools
-- ============================================================================
-- RLS POLICY NOTES (future):
--   * SELECT: anyone authenticated can read schools where is_active = true
--            (for signup dropdowns). Super admin sees all.
--   * INSERT/UPDATE/DELETE: super_admin only.
create table public.schools (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null unique,
  is_active                 boolean not null default true,
  require_teacher_approval  boolean not null default true,
  created_at                timestamptz not null default now()
);


-- ============================================================================
-- 2. profiles
-- ============================================================================
-- Mirrors Supabase Auth user IDs (one row per auth.users row).
-- Student uniqueness (phone + first_name + school_id) is enforced via a
-- PARTIAL UNIQUE INDEX so that it only applies to rows where role='student'.
--
-- RLS POLICY NOTES (future):
--   * SELECT self: every user can read their own profile.
--   * SELECT school-scoped: principals read profiles of teachers/students in
--     their assigned schools; teachers read students in their taught classes.
--   * INSERT: handled by auth trigger / signup flow.
--   * UPDATE: user can update own non-critical fields; class change goes
--     through class_change_requests.
--   * DELETE: super_admin only (or cascade from auth.users).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  phone       text,            -- students only (login identifier)
  email       text,            -- teachers + principals + super admin (login identifier)
  role        text not null check (role in ('super_admin','principal','teacher','student')),
  school_id   uuid references public.schools(id) on delete restrict, -- students only, fixed forever
  class       int check (class between 1 and 12),                    -- students only, Grade 1-12
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  -- A student must have phone, school_id, class; must not have email.
  -- A teacher/principal/super_admin must have email; must not have phone/school_id/class.
  constraint profiles_student_fields_ck check (
    (role = 'student'
       and phone is not null
       and school_id is not null
       and class is not null
       and email is null)
    or
    (role in ('teacher','principal','super_admin')
       and email is not null
       and phone is null
       and school_id is null
       and class is null)
  )
);

-- Student uniqueness: phone + first_name + school_id (per PRD §2.4, §10.2).
create unique index profiles_student_unique_idx
  on public.profiles (phone, first_name, school_id)
  where role = 'student';

-- Fast lookup by email for teacher/principal/super_admin login.
create unique index profiles_email_unique_idx
  on public.profiles (email)
  where email is not null;

create index profiles_role_idx    on public.profiles (role);
create index profiles_school_idx  on public.profiles (school_id) where school_id is not null;


-- ============================================================================
-- 3. teacher_schools (junction: teacher <-> school + approval status)
-- ============================================================================
-- Teachers can belong to multiple schools; each school approves independently.
--
-- RLS POLICY NOTES (future):
--   * SELECT: teacher reads own rows; principal reads rows for their schools.
--   * INSERT: teacher self-registers (creates pending row) or principal adds.
--   * UPDATE: principal toggles is_approved / is_active for their schools.
--   * DELETE: principal removes teacher from their school.
create table public.teacher_schools (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles(id) on delete cascade,
  school_id    uuid not null references public.schools(id)  on delete cascade,
  is_approved  boolean not null default false,
  is_active    boolean not null default true,
  joined_at    timestamptz not null default now(),

  constraint teacher_schools_unique unique (teacher_id, school_id)
);

create index teacher_schools_teacher_idx on public.teacher_schools (teacher_id);
create index teacher_schools_school_idx  on public.teacher_schools (school_id);


-- ============================================================================
-- 4. courses
-- ============================================================================
-- Per PRD §6.1: one course belongs to one teacher in one school.
-- UNIQUE (title, school_id) — no duplicate course names per school.
--
-- RLS POLICY NOTES (future):
--   * SELECT: students see courses where is_active AND assigned to their
--     class (via course_classes) AND school matches. Teachers see own courses.
--     Principals see all courses in their schools.
--   * INSERT: teacher creates.
--   * UPDATE: teacher updates own course; principal can reassign teacher_id
--     and toggle is_active.
--   * DELETE: avoid — prefer is_active = false.
create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles(id) on delete restrict,
  school_id    uuid not null references public.schools(id)  on delete cascade,
  title        text not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),

  constraint courses_title_school_unique unique (title, school_id)
);

create index courses_teacher_idx on public.courses (teacher_id);
create index courses_school_idx  on public.courses (school_id);


-- ============================================================================
-- 5. course_classes (junction: course <-> class grade)
-- ============================================================================
-- One course can target multiple classes (Grade 1-12).
--
-- RLS POLICY NOTES (future):
--   * Follows parent course's policy.
create table public.course_classes (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  class      int  not null check (class between 1 and 12),

  constraint course_classes_unique unique (course_id, class)
);

create index course_classes_course_idx on public.course_classes (course_id);
create index course_classes_class_idx  on public.course_classes (class);


-- ============================================================================
-- 6. assignments
-- ============================================================================
-- Per PRD §7.1 and §10.2.
--
-- RLS POLICY NOTES (future):
--   * SELECT: students see only is_live=true assignments where their class is
--     in assignment_classes AND parent course is active AND school is active.
--     Teachers see all assignments for their courses.
--     Principals see all assignments for courses in their schools.
--   * INSERT/UPDATE/DELETE: owning teacher (or principal override for is_live).
create table public.assignments (
  id                         uuid primary key default gen_random_uuid(),
  course_id                  uuid not null references public.courses(id) on delete cascade,
  title                      text not null,
  instructions               text,
  instruction_file_url       text,
  instruction_type           text check (instruction_type in ('text','image','audio')),
  allowed_submission_types   text[] not null check (
                                array_length(allowed_submission_types, 1) >= 1
                                and allowed_submission_types <@ array['text','image','audio']
                              ),
  due_date                   timestamptz not null,
  accept_late_submissions    boolean not null default false,
  teacher_score              int not null check (teacher_score >= 0),
  is_live                    boolean not null default true,
  created_at                 timestamptz not null default now()
);

create index assignments_course_idx    on public.assignments (course_id);
create index assignments_is_live_idx   on public.assignments (is_live);
create index assignments_due_date_idx  on public.assignments (due_date);


-- ============================================================================
-- 7. assignment_classes (junction: assignment <-> class grade)
-- ============================================================================
-- RLS POLICY NOTES (future): follows parent assignment's policy.
create table public.assignment_classes (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments(id) on delete cascade,
  class          int  not null check (class between 1 and 12),

  constraint assignment_classes_unique unique (assignment_id, class)
);

create index assignment_classes_assignment_idx on public.assignment_classes (assignment_id);
create index assignment_classes_class_idx      on public.assignment_classes (class);


-- ============================================================================
-- 8. submissions
-- ============================================================================
-- ONE submission per student per assignment (PRD §8.3).
-- is_visible=false when student account disabled OR assignment set to UNLIVE
-- (PRD §8.3). Raw row is never deleted.
--
-- RLS POLICY NOTES (future):
--   * SELECT: student reads own submissions. Teacher reads submissions for
--     their assignments where is_visible=true. Principal: NO access to
--     submission content (PRD §2.2).
--   * INSERT: student inserts own row (one per assignment, enforced by UNIQUE).
--   * UPDATE: system-only (e.g., flipping is_visible); no student edits.
--   * DELETE: none — submissions are permanent.
create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references public.assignments(id) on delete cascade,
  student_id      uuid not null references public.profiles(id)    on delete cascade,
  submission_type text not null check (submission_type in ('text','image','audio')),
  text_content    text,
  file_url        text,
  transcript      text,
  total_words     int check (total_words  >= 0),
  unique_words    int check (unique_words >= 0),
  is_visible      boolean not null default true,
  submitted_at    timestamptz not null default now(),

  constraint submissions_unique_per_student unique (assignment_id, student_id),

  -- Each submission type must carry the right payload.
  constraint submissions_payload_ck check (
    (submission_type = 'text'  and text_content is not null)
    or
    (submission_type = 'image' and file_url is not null)
    or
    (submission_type = 'audio' and file_url is not null)
  )
);

create index submissions_assignment_idx on public.submissions (assignment_id);
create index submissions_student_idx    on public.submissions (student_id);
create index submissions_visible_idx    on public.submissions (is_visible);


-- ============================================================================
-- 9. scores  (AGGREGATED per period — NOT per submission)
-- ============================================================================
-- Scores are aggregated per student per period (weekly or monthly) per school.
-- Raw per-submission data lives on `submissions` (transcript, total_words).
-- After each new submission, the RPC `recalculate_student_scores` recomputes
-- the rolled-up row here:
--
--   teacher_score_total = SUM(assignments.teacher_score for that period)
--   total_words         = SUM(submissions.total_words   for that period)
--   unique_words        = COUNT(DISTINCT word across ALL transcripts in that period)
--   total_score         = teacher_score_total + total_words*1 + unique_words*3
--
-- Students NEVER see per-assignment scores — only the weekly/monthly total
-- (surfaced via leaderboards). Raw submissions are kept forever (PRD §9.3).
--
-- RLS POLICY NOTES (future):
--   * SELECT: student reads own. Teacher reads scores for students in
--     assigned classes. Principal: NO access (PRD §2.2).
--   * INSERT/UPDATE: system (RPC `recalculate_student_scores`).
--   * DELETE: none.
create table public.scores (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references public.profiles(id) on delete cascade,
  school_id            uuid not null references public.schools(id)  on delete cascade,
  period_type          text not null check (period_type in ('weekly','monthly')),
  period_start         date not null, -- Monday of week, or 1st of month
  teacher_score_total  int  not null default 0 check (teacher_score_total >= 0),
  total_words          int  not null default 0 check (total_words         >= 0),
  unique_words         int  not null default 0 check (unique_words        >= 0),
  total_score          int  not null default 0 check (total_score         >= 0),
  updated_at           timestamptz not null default now(),

  constraint scores_unique_period unique (student_id, school_id, period_type, period_start)
);

create index scores_student_idx  on public.scores (student_id);
create index scores_school_idx   on public.scores (school_id);
create index scores_period_idx   on public.scores (period_type, period_start);

-- NOTE: The companion RPC `public.recalculate_student_scores(p_submission_id uuid)`
-- is defined directly in Supabase (already applied). It is invoked by the
-- client after each successful submission insert to refresh this table.


-- ============================================================================
-- 10. leaderboard_weekly
-- ============================================================================
-- Aggregated weekly scores per student per school.
-- Resets every Monday at midnight (PRD §9.3). Historical rows can be kept or
-- truncated — we keep them with an explicit period_start so prior weeks are
-- still queryable if ever needed.
--
-- RLS POLICY NOTES (future):
--   * SELECT: student sees only own row for the current period.
--     Teacher / principal see full leaderboard for their school (PRD §9.3).
--   * INSERT/UPDATE: system (scheduled aggregator).
--   * DELETE: none.
create table public.leaderboard_weekly (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  school_id     uuid not null references public.schools(id)  on delete cascade,
  period_start  date not null, -- Monday of that week
  total_score   int  not null default 0 check (total_score >= 0),
  rank          int  check (rank >= 1),
  updated_at    timestamptz not null default now(),

  constraint leaderboard_weekly_unique unique (student_id, school_id, period_start)
);

create index leaderboard_weekly_school_period_idx
  on public.leaderboard_weekly (school_id, period_start, total_score desc);


-- ============================================================================
-- 11. leaderboard_monthly
-- ============================================================================
-- Aggregated monthly scores per student per school.
-- Resets on the 1st of each month at midnight (PRD §9.3).
--
-- RLS POLICY NOTES (future): same as leaderboard_weekly.
create table public.leaderboard_monthly (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  school_id     uuid not null references public.schools(id)  on delete cascade,
  period_start  date not null, -- 1st day of that month
  total_score   int  not null default 0 check (total_score >= 0),
  rank          int  check (rank >= 1),
  updated_at    timestamptz not null default now(),

  constraint leaderboard_monthly_unique unique (student_id, school_id, period_start)
);

create index leaderboard_monthly_school_period_idx
  on public.leaderboard_monthly (school_id, period_start, total_score desc);


-- ============================================================================
-- 12. class_change_requests
-- ============================================================================
-- Per PRD §5: one pending request at a time (enforced by partial unique idx).
-- Re-request after rejection allowed immediately.
--
-- RLS POLICY NOTES (future):
--   * SELECT: student reads own; teacher reads requests for their enrolled
--     courses; principal reads all for their schools.
--   * INSERT: student creates own pending request.
--   * UPDATE: teacher approves/rejects (sets status + resolved_at). Principal
--     bulk approve per PRD §2.2.
--   * DELETE: none.
create table public.class_change_requests (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  school_id        uuid not null references public.schools(id)  on delete cascade,
  current_class    int  not null check (current_class   between 1 and 12),
  requested_class  int  not null check (requested_class between 1 and 12),
  status           text not null default 'pending'
                     check (status in ('pending','approved','rejected')),
  requested_at     timestamptz not null default now(),
  resolved_at      timestamptz,

  constraint class_change_requests_different_class_ck
    check (current_class <> requested_class)
);

-- Enforce "one pending request at a time per student" (PRD §5.2).
create unique index class_change_requests_one_pending_idx
  on public.class_change_requests (student_id)
  where status = 'pending';

create index class_change_requests_school_idx  on public.class_change_requests (school_id);
create index class_change_requests_status_idx  on public.class_change_requests (status);


-- ============================================================================
-- 13. badges
-- ============================================================================
-- One row per (student, school, badge_type). `count` increments each time
-- the badge is earned. Badges never reset (PRD §9.4, §9.5).
--
-- RLS POLICY NOTES (future):
--   * SELECT: student reads own; teacher/principal read for their school.
--   * INSERT/UPDATE: system (scheduled leaderboard/streak aggregator).
--   * DELETE: none.
create table public.badges (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles(id) on delete cascade,
  school_id       uuid not null references public.schools(id)  on delete cascade,
  badge_type      text not null check (badge_type in (
                    'weekly_streak','monthly_streak','weekly_top5','monthly_top5'
                  )),
  count           int  not null default 0 check (count >= 0),
  last_earned_at  timestamptz,

  constraint badges_unique_per_student_type unique (student_id, badge_type)
);

create index badges_school_idx  on public.badges (school_id);
create index badges_type_idx    on public.badges (badge_type);


-- ============================================================================
-- Row Level Security — DISABLED for all tables (enable later)
-- ============================================================================
-- IMPORTANT: RLS is intentionally turned OFF during initial development.
-- Every table above has a "RLS POLICY NOTES (future)" comment block that
-- captures the intended read/write rules. When auth flows are wired up,
-- each `alter table ... enable row level security;` + `create policy ...`
-- block will be added in a follow-up migration.

alter table public.schools               disable row level security;
alter table public.profiles              disable row level security;
alter table public.teacher_schools       disable row level security;
alter table public.courses               disable row level security;
alter table public.course_classes        disable row level security;
alter table public.assignments           disable row level security;
alter table public.assignment_classes    disable row level security;
alter table public.submissions           disable row level security;
alter table public.scores                disable row level security;
alter table public.leaderboard_weekly    disable row level security;
alter table public.leaderboard_monthly   disable row level security;
alter table public.class_change_requests disable row level security;
alter table public.badges                disable row level security;
