import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

/**
 * Student Assignment Detail (PRD §8)
 * - Validates that the assignment is live, course is active, and the
 *   student's class is in assignment_classes.
 * - Shows title, due date, instructions, allowed submission types,
 *   teacher score, and either a Submit CTA, the student's existing
 *   submission, or a closed banner depending on state.
 */
export default function StudentAssignmentDetail() {
  const { id: assignmentId } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuthProfile('student');

  const [assignment, setAssignment] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !profile || !assignmentId) return;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: a, error: aErr } = await supabase
        .from('assignments')
        .select(`
          id, title, instructions, instruction_file_url, instruction_type,
          allowed_submission_types, due_date, accept_late_submissions,
          teacher_score, is_live,
          assignment_classes ( class ),
          course:courses!inner (
            id, title, is_active, school_id,
            teacher:profiles!courses_teacher_id_fkey ( first_name, last_name )
          )
        `)
        .eq('id', assignmentId)
        .maybeSingle();

      if (aErr) {
        setError(aErr.message);
        setLoading(false);
        return;
      }
      if (!a) {
        navigate('/student', { replace: true });
        return;
      }

      // Gate: must be live, course active, and student's class in list.
      const classes = (a.assignment_classes ?? []).map((r) => r.class);
      const allowedForStudent =
        a.is_live &&
        a.course?.is_active &&
        a.course?.school_id === profile.school_id &&
        classes.includes(profile.class);

      if (!allowedForStudent) {
        navigate('/student', { replace: true });
        return;
      }

      setAssignment({
        id: a.id,
        title: a.title,
        instructions: a.instructions,
        instructionFileUrl: a.instruction_file_url,
        instructionType: a.instruction_type,
        allowedTypes: a.allowed_submission_types ?? [],
        dueDate: a.due_date,
        acceptLate: a.accept_late_submissions,
        teacherScore: a.teacher_score,
        courseId: a.course?.id,
        courseTitle: a.course?.title ?? '',
        teacherName: a.course?.teacher
          ? `${a.course.teacher.first_name ?? ''} ${a.course.teacher.last_name ?? ''}`.trim()
          : 'Teacher',
      });

      const { data: sub, error: sErr } = await supabase
        .from('submissions')
        .select('id, submission_type, text_content, file_url, transcript, submitted_at, is_visible')
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
        .maybeSingle();
      if (sErr) {
        setError(sErr.message);
        setLoading(false);
        return;
      }
      setSubmission(sub ?? null);
      setLoading(false);
    })();
  }, [user, profile, assignmentId, navigate]);

  const status = useMemo(() => {
    if (!assignment) return 'loading';
    const now = Date.now();
    const due = new Date(assignment.dueDate).getTime();
    const expired = now > due && !assignment.acceptLate;
    if (submission) return 'submitted';
    if (expired) return 'closed';
    return 'open';
  }, [assignment, submission]);

  if (authLoading || loading) return <FullScreenSpinner />;
  if (!assignment) return null;

  const due = new Date(assignment.dueDate);
  const dueLabel = due.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    year: due.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
  const timeLabel = due.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit',
  });
  const overdue = due.getTime() < Date.now();

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/student" />
      </div>

      {/* Header */}
      <div className="px-6 pt-3">
        <p className="text-[12px] font-bold text-indigo-600 truncate">
          {assignment.courseTitle} · with {assignment.teacherName}
        </p>
        <h1 className="mt-1 text-[24px] leading-tight font-black text-slate-900">
          {assignment.title}
        </h1>
        <div className={`mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold ${overdue && !assignment.acceptLate ? 'text-rose-600' : 'text-slate-600'}`}>
          <span>⏰</span>
          <span>Due {dueLabel} · {timeLabel}</span>
          {assignment.acceptLate && overdue && (
            <span className="ml-1 text-[10px] font-extrabold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
              LATE OK
            </span>
          )}
        </div>
      </div>

      {/* Status banner */}
      <div className="px-5 pt-4">
        {status === 'submitted' && <StatusBanner kind="submitted" />}
        {status === 'closed' && <StatusBanner kind="closed" />}
      </div>

      {/* Instructions */}
      <div className="px-5 pt-4">
        <SectionLabel>Instructions</SectionLabel>
        <div className="mt-1.5 bg-white ring-1 ring-slate-200 rounded-2xl p-4">
          {assignment.instructions ? (
            <p className="text-[14px] font-medium text-slate-700 whitespace-pre-wrap">
              {assignment.instructions}
            </p>
          ) : (
            <p className="text-[13px] font-semibold text-slate-400 italic">
              No instructions provided.
            </p>
          )}

          {assignment.instructionFileUrl && assignment.instructionType === 'image' && (
            <div className="mt-3">
              <img
                src={assignment.instructionFileUrl}
                alt="Instruction image"
                className="w-full rounded-xl ring-1 ring-slate-200 max-h-80 object-contain bg-slate-50"
              />
              <DownloadLink
                url={assignment.instructionFileUrl}
                fileName={inferFileName(assignment.instructionFileUrl, 'instruction.jpg')}
                label="Download image"
              />
            </div>
          )}

          {assignment.instructionFileUrl && assignment.instructionType === 'audio' && (
            <div className="mt-3">
              <audio controls preload="metadata" src={assignment.instructionFileUrl} className="w-full" />
              <DownloadLink
                url={assignment.instructionFileUrl}
                fileName={inferFileName(assignment.instructionFileUrl, 'instruction.webm')}
                label="Download audio"
              />
            </div>
          )}

          {assignment.instructionFileUrl && assignment.instructionType === 'pdf' && (
            <div className="mt-3 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 ring-1 ring-rose-100 flex items-center justify-center text-xl shrink-0">
                📄
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-extrabold text-slate-900 truncate">
                  {inferFileName(assignment.instructionFileUrl, 'instruction.pdf')}
                </div>
                <div className="text-[11px] font-semibold text-slate-500">
                  PDF document
                </div>
              </div>
              <a
                href={assignment.instructionFileUrl}
                download={inferFileName(assignment.instructionFileUrl, 'instruction.pdf')}
                target="_blank"
                rel="noreferrer"
                className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-[12px] font-extrabold flex items-center gap-1.5 active:scale-95"
              >
                ⬇ Download
              </a>
            </div>
          )}

          {assignment.instructionFileUrl &&
            !['image', 'audio', 'pdf'].includes(assignment.instructionType) && (
            <a
              href={assignment.instructionFileUrl}
              target="_blank"
              rel="noreferrer"
              download
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-indigo-600 hover:text-indigo-700"
            >
              📎 View attachment
            </a>
          )}
        </div>
      </div>

      {/* Allowed submission types */}
      <div className="px-5 pt-4">
        <SectionLabel>You can submit as</SectionLabel>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {assignment.allowedTypes.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </div>
      </div>

      {/* Teacher score info */}
      <div className="px-5 pt-4">
        <SectionLabel>Scoring</SectionLabel>
        <div className="mt-1.5 bg-white ring-1 ring-slate-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">
              ⭐
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold text-slate-900">
                Teacher score: {assignment.teacherScore}
              </div>
              <div className="text-[11.5px] font-semibold text-slate-500">
                Plus bonus points for total &amp; unique words.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Existing submission preview */}
      {submission && (
        <div className="px-5 pt-4">
          <SectionLabel>Your submission</SectionLabel>
          <div className="mt-1.5 bg-white ring-1 ring-slate-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TypeBadge type={submission.submission_type} small />
              <span className="text-[11.5px] font-semibold text-slate-500">
                Submitted {new Date(submission.submitted_at).toLocaleString()}
              </span>
            </div>
            {submission.submission_type === 'text' && submission.text_content && (
              <p className="text-[14px] font-medium text-slate-700 whitespace-pre-wrap">
                {submission.text_content}
              </p>
            )}
            {submission.submission_type === 'image' && submission.file_url && (
              <img
                src={submission.file_url}
                alt="Your submission"
                className="mt-1 w-full rounded-xl ring-1 ring-slate-200"
              />
            )}
            {submission.submission_type === 'audio' && submission.file_url && (
              <audio controls preload="metadata" src={submission.file_url} className="w-full mt-1" />
            )}
            {submission.transcript && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide mb-1">
                  Transcript
                </div>
                <p className="text-[13px] font-medium text-slate-600 whitespace-pre-wrap">
                  {submission.transcript}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="px-5 pt-4">
          <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
            <p className="text-[13px] font-semibold text-rose-700">{error}</p>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="px-5 pt-6 pb-8 mt-auto">
        {status === 'open' && (
          <Link
            to={`/student/assignments/${assignment.id}/submit`}
            className="
              w-full h-14 rounded-2xl bg-indigo-600 text-white
              text-base font-extrabold shadow-lg shadow-indigo-600/30
              flex items-center justify-center gap-2
              active:scale-[0.98] transition
            "
          >
            🎤 Submit assignment
          </Link>
        )}
        {status === 'closed' && (
          <div className="w-full h-14 rounded-2xl bg-slate-200 text-slate-500 text-[14px] font-extrabold flex items-center justify-center">
            Assignment closed
          </div>
        )}
        {status === 'submitted' && (
          <div className="w-full h-14 rounded-2xl bg-emerald-100 text-emerald-800 text-[14px] font-extrabold flex items-center justify-center gap-2">
            ✅ Submitted — waiting for score
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 pl-1">
      {children}
    </div>
  );
}

function DownloadLink({ url, fileName, label }) {
  return (
    <a
      href={url}
      download={fileName}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-indigo-600 hover:text-indigo-700"
    >
      ⬇ {label}
    </a>
  );
}

function inferFileName(url, fallback) {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last && last.includes('.') ? decodeURIComponent(last) : fallback;
  } catch {
    return fallback;
  }
}

function TypeBadge({ type, small }) {
  const map = {
    text:  { emoji: '✍️', label: 'Text',  cls: 'bg-sky-50 text-sky-700 ring-sky-100' },
    image: { emoji: '🖼️', label: 'Image', cls: 'bg-violet-50 text-violet-700 ring-violet-100' },
    audio: { emoji: '🎤', label: 'Audio', cls: 'bg-rose-50 text-rose-700 ring-rose-100' },
  };
  const cfg = map[type] ?? { emoji: '📄', label: type, cls: 'bg-slate-50 text-slate-700 ring-slate-100' };
  return (
    <span className={`
      inline-flex items-center gap-1.5 rounded-full ring-1
      ${small ? 'text-[10.5px] px-2 py-0.5' : 'text-[12px] px-3 py-1'}
      font-extrabold ${cfg.cls}
    `}>
      <span>{cfg.emoji}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

function StatusBanner({ kind }) {
  if (kind === 'submitted') {
    return (
      <div className="rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 flex items-start gap-2">
        <div className="text-xl leading-none">✅</div>
        <div>
          <div className="text-[13.5px] font-extrabold text-emerald-800">Submitted</div>
          <div className="text-[11.5px] font-semibold text-emerald-700">
            You've already submitted this one.
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'closed') {
    return (
      <div className="rounded-2xl bg-slate-100 ring-1 ring-slate-200 px-4 py-3 flex items-start gap-2">
        <div className="text-xl leading-none">🔒</div>
        <div>
          <div className="text-[13.5px] font-extrabold text-slate-800">Assignment closed</div>
          <div className="text-[11.5px] font-semibold text-slate-600">
            The due date has passed and late submissions aren't accepted.
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function FullScreenSpinner() {
  return (
    <div className="h-full flex items-center justify-center bg-slate-50">
      <svg className="animate-spin text-indigo-600" width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}