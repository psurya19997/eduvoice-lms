import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

/**
 * Course Detail (PRD §6.3, §7)
 * - Shows course header (name, description, grade pills).
 * - Lists assignments for this course with due date, submission count,
 *   and a Live/Unlive toggle (flips assignments.is_live).
 * - "+ New Assignment" CTA → /teacher/assignments/new?courseId=:id
 *
 * Ownership gate: if course.teacher_id !== current user, redirect to /teacher.
 */
export default function TeacherCourseDetail() {
  const { id: courseId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthProfile('teacher');

  const [course, setCourse] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    if (!user || !courseId) return;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: c, error: cErr } = await supabase
        .from('courses')
        .select(`
          id, title, description, teacher_id, is_active,
          course_classes ( class )
        `)
        .eq('id', courseId)
        .maybeSingle();

      if (cErr) {
        setError(cErr.message);
        setLoading(false);
        return;
      }
      if (!c) {
        navigate('/teacher', { replace: true });
        return;
      }
      if (c.teacher_id !== user.id) {
        navigate('/teacher', { replace: true });
        return;
      }

      setCourse({
        id: c.id,
        title: c.title,
        description: c.description,
        isActive: c.is_active,
        classes: (c.course_classes ?? []).map((r) => r.class).sort((a, b) => a - b),
      });

      const { data: aRows, error: aErr } = await supabase
        .from('assignments')
        .select(`
          id, title, due_date, is_live, created_at,
          submissions ( id )
        `)
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

      if (aErr) {
        setError(aErr.message);
        setLoading(false);
        return;
      }

      setAssignments(
        (aRows ?? []).map((a) => ({
          id: a.id,
          title: a.title,
          dueDate: a.due_date,
          isLive: a.is_live,
          submissionCount: (a.submissions ?? []).length,
        })),
      );
      setLoading(false);
    })();
  }, [user, courseId, navigate]);

  const toggleLive = async (assignmentId, nextValue) => {
    setTogglingId(assignmentId);
    const prev = assignments;
    setAssignments((list) =>
      list.map((a) => (a.id === assignmentId ? { ...a, isLive: nextValue } : a)),
    );
    const { error: uErr } = await supabase
      .from('assignments')
      .update({ is_live: nextValue })
      .eq('id', assignmentId);
    setTogglingId(null);
    if (uErr) {
      setAssignments(prev);
      setError(uErr.message);
    }
  };

  if (authLoading || loading) return <FullScreenSpinner />;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/teacher" />
      </div>

      {course && (
        <div className="px-6 pt-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl shadow-md shrink-0">
              📘
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] leading-tight font-black text-slate-900 truncate">
                {course.title}
              </h1>
              {course.description && (
                <p className="mt-1 text-[13.5px] font-medium text-slate-500">
                  {course.description}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center flex-wrap gap-1.5">
            {course.classes.length > 0 ? (
              course.classes.map((cl) => (
                <span
                  key={cl}
                  className="text-[11px] font-bold text-indigo-700 bg-indigo-50 ring-1 ring-indigo-100 rounded-full px-2 py-0.5"
                >
                  Grade {cl}
                </span>
              ))
            ) : (
              <span className="text-[11px] font-semibold text-slate-400">No classes set</span>
            )}
            {!course.isActive && (
              <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                DISABLED
              </span>
            )}
          </div>
        </div>
      )}

      <div className="px-6 pt-6 pb-3 flex items-end justify-between">
        <div>
          <h2 className="text-[17px] font-extrabold text-slate-900">Assignments</h2>
          <p className="text-[12px] font-semibold text-slate-500">
            Tap a toggle to live/unlive an assignment.
          </p>
        </div>
        <Link
          to={`/teacher/assignments/new?courseId=${courseId}`}
          className="
            h-10 px-3 rounded-xl bg-indigo-600 text-white
            text-[13px] font-extrabold
            flex items-center gap-1.5
            shadow-md shadow-indigo-600/30 active:scale-[0.98] transition
          "
        >
          <span className="text-[16px] leading-none">＋</span>
          New
        </Link>
      </div>

      <div className="px-5 pb-8 flex-1">
        {error ? (
          <ErrorBox message={error} />
        ) : assignments.length === 0 ? (
          <EmptyBox
            emoji="📝"
            title="No assignments yet"
            body="Create your first assignment to start collecting student audio submissions."
            ctaLabel="Create assignment"
            ctaTo={`/teacher/assignments/new?courseId=${courseId}`}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {assignments.map((a) => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                toggling={togglingId === a.id}
                onToggle={(next) => toggleLive(a.id, next)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function AssignmentCard({ assignment, toggling, onToggle }) {
  const due = new Date(assignment.dueDate);
  const dueLabel = due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: due.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
  const timeLabel = due.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const overdue = due.getTime() < Date.now();

  return (
    <div className="bg-white rounded-3xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      {/* Tappable body → assignment detail */}
      <Link to={`/teacher/assignments/${assignment.id}`} className="block p-4">
        <div className="flex items-start gap-2 flex-wrap">
          <div className="text-[15px] font-extrabold text-slate-900 leading-snug flex-1 min-w-0 truncate">
            {assignment.title}
          </div>
          {assignment.isLive ? (
            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5 shrink-0">
              LIVE
            </span>
          ) : (
            <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">
              UNLIVE
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center flex-wrap gap-x-3 gap-y-1">
          <div className={`text-[11.5px] font-bold ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
            ⏰ Due {dueLabel} · {timeLabel}
          </div>
          <div className="text-[11.5px] font-bold text-slate-500">
            📥 {assignment.submissionCount} submission{assignment.submissionCount === 1 ? '' : 's'}
          </div>
        </div>
      </Link>

      {/* Footer: live toggle + quick submissions link */}
      <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-semibold text-slate-500">
            {assignment.isLive ? 'Live' : 'Unlive'}
          </span>
          <Toggle on={assignment.isLive} disabled={toggling} onChange={onToggle} />
        </div>
        <Link
          to={`/teacher/assignments/${assignment.id}/submissions`}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-indigo-600"
        >
          👀 Submissions
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function Toggle({ on, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`
        shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition
        ${on ? 'bg-indigo-600' : 'bg-slate-300'}
        ${disabled ? 'opacity-60 cursor-not-allowed' : 'active:scale-95'}
      `}
    >
      <span
        className={`
          inline-block h-5 w-5 transform rounded-full bg-white shadow transition
          ${on ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}

function EmptyBox({ emoji, title, body, ctaLabel, ctaTo }) {
  return (
    <div className="mx-1 mt-4 rounded-3xl bg-white ring-1 ring-slate-200 p-8 text-center">
      <div className="text-5xl mb-2">{emoji}</div>
      <h3 className="text-[17px] font-extrabold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-[13px] font-medium text-slate-500 max-w-[260px] mx-auto">
        {body}
      </p>
      {ctaLabel && ctaTo && (
        <Link
          to={ctaTo}
          className="
            inline-flex items-center gap-1.5 mt-5 h-11 px-4 rounded-2xl bg-indigo-600 text-white
            text-[13px] font-extrabold shadow-md shadow-indigo-600/30 active:scale-[0.98] transition
          "
        >
          <span className="text-[16px] leading-none">＋</span>
          {ctaLabel}
        </Link>
      )}
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
