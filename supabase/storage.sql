-- ============================================================================
-- EduVoice LMS — Storage Buckets
-- Source: PRD v4.0 FINAL
--
-- Two buckets:
--   1. assignment-briefs — optional teacher uploads (image/audio) attached
--      to an assignment (PRD §7.1 "Instruction Media").
--   2. submissions       — student uploads: audio recordings + image answers
--      (PRD §8.1).
--
-- Both are created PRIVATE. Signed URLs will be generated server-side when
-- files need to be served to students/teachers.
--
-- Storage RLS policies are also DISABLED for now (see bottom). Policies will
-- be written later alongside the auth flow.
-- ============================================================================

-- Create buckets (idempotent) --------------------------------------------
insert into storage.buckets (id, name, public)
values ('assignment-briefs', 'assignment-briefs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;


-- ============================================================================
-- Storage RLS — DISABLED for now
-- ============================================================================
-- NOTE: On Supabase, storage.objects has RLS on by default. We keep RLS
-- enforced at the PostgREST layer but add no policies yet, which means
-- writes via anon/authenticated clients will be BLOCKED. During initial
-- development, all file I/O should go through the service-role key (or
-- direct dashboard uploads) until we wire up proper policies.
--
-- STORAGE POLICY NOTES (future):
--
--   Bucket: assignment-briefs
--     * SELECT: students in the target class; teacher who owns the course;
--              principal of the school.
--     * INSERT: owning teacher.
--     * UPDATE/DELETE: owning teacher (until any student has submitted).
--
--   Bucket: submissions
--     * SELECT: submitting student (own files); teacher of parent assignment;
--              principal is BLOCKED (PRD §2.2 — principal never sees
--              submission content).
--     * INSERT: authenticated student into a path like
--              `{assignment_id}/{student_id}/{filename}`.
--     * UPDATE/DELETE: NONE — submissions are final (PRD §8.3).
