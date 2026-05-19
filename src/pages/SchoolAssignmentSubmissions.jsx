import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function SchoolAssignmentSubmissions() {
  const { id: assignmentId } = useParams();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId');
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthProfile('teacher');

  const [assignment, setAssignment] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!user || !assignmentId) return;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: a, error: aErr } = await supabase
        .from('assignments')
        .select(`
          id, title, due_date, is_live,
          assignment_classes(class),
          course:courses!inner(id, title, school_id)
        `)
        .eq('id', assignmentId)
        .maybeSingle();

      if (aErr) { setError(aErr.message); setLoading(false); return; }
      if (!a) { navigate('/teacher/school', { replace: true }); return; }

      // Verify the current teacher is approved at this course's school.
      const { data: membership } = await supabase
        .from('teacher_schools')
        .select('id')
        .eq('teacher_id', user.id)
        .eq('school_id', a.course.school_id)
        .eq('is_approved', true)
        .eq('is_active', true)
        .maybeSingle();

      if (!membership) { navigate('/teacher/school', { replace: true }); return; }

      const classes = (a.assignment_classes ?? []).map((r) => r.class);
      setAssignment({
        id: a.id,
        title: a.title,
        dueDate: a.due_date,
        isLive: a.is_live,
        courseId: a.course.id,
        courseTitle: a.course.title,
        schoolId: a.course.school_id,
        classes,
      });

      const [studentsRes, subsRes] = await Promise.all([
        classes.length === 0
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from('profiles')
              .select('id, first_name, last_name, class, is_active')
              .eq('role', 'student')
              .eq('school_id', a.course.school_id)
              .in('class', classes),
        supabase
          .from('submissions')
          .select('id, student_id, submission_type, text_content, file_url, transcript, submitted_at, is_visible')
          .eq('assignment_id', assignmentId),
      ]);

      if (studentsRes.error) { setError(studentsRes.error.message); setLoading(false); return; }
      if (subsRes.error) { setError(subsRes.error.message); setLoading(false); return; }

      const byStudent = new Map((subsRes.data ?? []).map((s) => [s.student_id, s]));
      const joined = (studentsRes.data ?? [])
        .filter((s) => s.is_active !== false)
        .map((s) => ({ student: s, submission: byStudent.get(s.id) ?? null }))
        .sort((a, b) => {
          const aSub = !!a.submission;
          const bSub = !!b.submission;
          if (aSub !== bSub) return aSub ? -1 : 1;
          if (aSub && bSub) return new Date(b.submission.submitted_at) - new Date(a.submission.submitted_at);
          return (a.student.first_name || '').localeCompare(b.student.first_name || '');
        });

      setRows(joined);
      setLoading(false);
    })();
  }, [user, assignmentId, navigate]);

  const counts = useMemo(() => {
    const total = rows.length;
    const submitted = rows.filter((r) => r.submission).length;
    return { total, submitted, pending: total - submitted };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (filter === 'submitted') return rows.filter((r) => r.submission);
    if (filter === 'pending') return rows.filter((r) => !r.submission);
    return rows;
  }, [rows, filter]);

  if (authLoading || loading) return <FullScreenSpinner />;
  if (!assignment) return null;

  const due = new Date(assignment.dueDate);
  const dueLabel = due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: due.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });

  const backTo = courseId
    ? `/teacher/school/courses/${courseId}`
    : '/teacher/school';

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to={backTo} />
      </div>

      <div className="px-6 pt-3">
        {/* View-only banner */}
        <div className="mb-3 flex items-center gap-2 bg-teal-50 ring-1 ring-teal-200 rounded-2xl px-4 py-2.5">
          <span className="text-teal-600 text-[16px]">👁</span>
          <p className="text-[12.5px] font-bold text-teal-700">View only</p>
        </div>

        <p className="text-[12px] font-bold text-teal-600 truncate">{assignment.courseTitle}</p>
        <h1 className="mt-1 text-[22px] leading-tight font-black text-slate-900">
          {assignment.title}
        </h1>
        <div className="mt-1.5 flex items-center flex-wrap gap-x-3 gap-y-1">
          <span className="text-[12px] font-bold text-slate-500">
            ⏰ Due {dueLabel} · {due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </span>
          {assignment.isLive ? (
            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
              LIVE
            </span>
          ) : (
            <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
              UNLIVE
            </span>
          )}
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Submitted</div>
            <div className="mt-0.5 text-[22px] font-black text-slate-900 leading-none">
              {counts.submitted}
              <span className="text-[14px] font-bold text-slate-400"> / {counts.total}</span>
            </div>
          </div>
          <div className="w-28">
            <ProgressBar value={counts.total === 0 ? 0 : counts.submitted / counts.total} />
          </div>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="grid grid-cols-3 gap-1 bg-white ring-1 ring-slate-200 rounded-2xl p-1">
          <FilterTab label={`All (${counts.total})`} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterTab label={`Done (${counts.submitted})`} active={filter === 'submitted'} onClick={() => setFilter('submitted')} />
          <FilterTab label={`Pending (${counts.pending})`} active={filter === 'pending'} onClick={() => setFilter('pending')} />
        </div>
      </div>

      <div className="px-5 pt-4 pb-8 flex-1">
        {error ? (
          <ErrorBox message={error} />
        ) : visibleRows.length === 0 ? (
          <EmptyBox
            emoji={filter === 'pending' ? '🎉' : '👀'}
            title={
              filter === 'pending' ? 'Everyone submitted!'
              : filter === 'submitted' ? 'No submissions yet'
              : 'No eligible students'
            }
            body={
              filter === 'pending'
                ? 'Nothing left to chase up.'
                : filter === 'submitted'
                ? 'Submissions will appear here as students respond.'
                : 'This assignment has no target classes or no students yet.'
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {visibleRows.map(({ student, submission }) =>
              submission
                ? <SubmittedCard key={student.id} student={student} submission={submission} />
                : <PendingCard key={student.id} student={student} />,
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterTab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        h-11 rounded-xl text-[12.5px] font-extrabold transition
        ${active ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'text-slate-500 hover:text-slate-700'}
      `}
    >
      {label}
    </button>
  );
}

function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SubmittedCard({ student, submission }) {
  const name = `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim();
  return (
    <div className="bg-white rounded-3xl ring-1 ring-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-extrabold text-slate-900 truncate">{name || 'Student'}</div>
          <div className="mt-0.5 flex items-center flex-wrap gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-bold text-slate-500">Grade {student.class}</span>
            <span className="text-[11px] font-semibold text-slate-400">·</span>
            <span className="text-[11px] font-bold text-slate-500">
              {new Date(submission.submitted_at).toLocaleString()}
            </span>
          </div>
        </div>
        <TypeBadge type={submission.submission_type} />
      </div>

      <div className="mt-3">
        {submission.submission_type === 'text' && (
          <p className="text-[13.5px] font-medium text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-3 ring-1 ring-slate-100">
            {(submission.text_content ?? '').slice(0, 600)}
            {(submission.text_content?.length ?? 0) > 600 ? '…' : ''}
          </p>
        )}
        {submission.submission_type === 'image' && submission.file_url && (
          <img
            src={submission.file_url}
            alt="Student submission"
            className="w-full rounded-xl ring-1 ring-slate-200 max-h-80 object-contain bg-slate-50"
          />
        )}
        {submission.submission_type === 'audio' && (
          <>
            {submission.file_url && (
              <audio controls preload="metadata" src={submission.file_url} className="w-full" />
            )}
            {submission.transcript ? (
              <div className="mt-3">
                <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-slate-500 mb-1">
                  Transcript
                </div>
                <p className="text-[13px] font-medium text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-xl p-3 ring-1 ring-slate-100">
                  {submission.transcript}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[11.5px] font-semibold text-slate-400 italic">No transcript captured.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PendingCard({ student }) {
  const name = `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim();
  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200 p-3 flex items-center gap-3 opacity-75">
      <Avatar name={name} muted />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-extrabold text-slate-500 truncate">{name || 'Student'}</div>
        <div className="text-[11px] font-bold text-slate-400">Grade {student.class}</div>
      </div>
      <span className="text-[10.5px] font-extrabold text-amber-700 bg-amber-100 rounded-full px-2.5 py-1">
        PENDING
      </span>
    </div>
  );
}

function Avatar({ name, muted }) {
  const letter = (name || '?').slice(0, 1).toUpperCase();
  return (
    <div className={`
      w-10 h-10 rounded-full text-white flex items-center justify-center
      text-[14px] font-extrabold shrink-0
      ${muted ? 'bg-slate-300' : 'bg-gradient-to-br from-teal-500 to-cyan-600'}
    `}>
      {letter}
    </div>
  );
}

function TypeBadge({ type }) {
  const map = {
    text:  { emoji: '✍️', label: 'Text',  cls: 'bg-sky-50 text-sky-700 ring-sky-100' },
    image: { emoji: '🖼️', label: 'Image', cls: 'bg-violet-50 text-violet-700 ring-violet-100' },
    audio: { emoji: '🎤', label: 'Audio', cls: 'bg-rose-50 text-rose-700 ring-rose-100' },
  };
  const cfg = map[type] ?? { emoji: '📄', label: type, cls: 'bg-slate-50 text-slate-700 ring-slate-100' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 text-[10.5px] px-2 py-0.5 font-extrabold ${cfg.cls}`}>
      <span>{cfg.emoji}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

function EmptyBox({ emoji, title, body }) {
  return (
    <div className="mx-1 mt-4 rounded-3xl bg-white ring-1 ring-slate-200 p-8 text-center">
      <div className="text-5xl mb-2">{emoji}</div>
      <h3 className="text-[17px] font-extrabold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-[13px] font-medium text-slate-500 max-w-[260px] mx-auto">{body}</p>
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div className="mx-1 rounded-2xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
      <p className="text-[13px] font-semibold text-rose-700">{message}</p>
    </div>
  );
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
