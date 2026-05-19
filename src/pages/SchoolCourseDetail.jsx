import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function SchoolCourseDetail() {
  const { id: courseId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthProfile('teacher');

  const [course, setCourse] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !courseId) return;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: c, error: cErr } = await supabase
        .from('courses')
        .select(`
          id, title, description, teacher_id, school_id, is_active,
          course_classes(class),
          teacher:profiles!courses_teacher_id_fkey(first_name, last_name)
        `)
        .eq('id', courseId)
        .maybeSingle();

      if (cErr) { setError(cErr.message); setLoading(false); return; }
      if (!c) { navigate('/teacher/school', { replace: true }); return; }

      // Verify the current teacher is approved at this course's school.
      const { data: membership } = await supabase
        .from('teacher_schools')
        .select('id')
        .eq('teacher_id', user.id)
        .eq('school_id', c.school_id)
        .eq('is_approved', true)
        .eq('is_active', true)
        .maybeSingle();

      if (!membership) { navigate('/teacher/school', { replace: true }); return; }

      setCourse({
        id: c.id,
        title: c.title,
        description: c.description,
        isOwn: c.teacher_id === user.id,
        teacherName: c.teacher
          ? `${c.teacher.first_name ?? ''} ${c.teacher.last_name ?? ''}`.trim()
          : 'Teacher',
        isActive: c.is_active,
        classes: (c.course_classes ?? []).map((r) => r.class).sort((a, b) => a - b),
      });

      const { data: aRows, error: aErr } = await supabase
        .from('assignments')
        .select(`id, title, due_date, is_live, created_at, submissions(id)`)
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

      if (aErr) { setError(aErr.message); setLoading(false); return; }

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

  if (authLoading || loading) return <FullScreenSpinner />;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/teacher/school" />
      </div>

      {course && (
        <div className="px-6 pt-3">
          {/* View-only banner */}
          <div className="mb-4 flex items-center gap-2 bg-teal-50 ring-1 ring-teal-200 rounded-2xl px-4 py-2.5">
            <span className="text-teal-600 text-[16px]">👁</span>
            <p className="text-[12.5px] font-bold text-teal-700">
              View only — you can read but not edit this course.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-2xl shadow-md shrink-0">
              📗
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] leading-tight font-black text-slate-900 truncate">
                {course.title}
              </h1>
              <p className="mt-0.5 text-[12.5px] font-bold text-slate-400">
                {course.isOwn ? 'Your course' : `by ${course.teacherName}`}
              </p>
              {course.description && (
                <p className="mt-1 text-[13.5px] font-medium text-slate-500">
                  {course.description}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center flex-wrap gap-1.5">
            {course.classes.map((cl) => (
              <span
                key={cl}
                className="text-[11px] font-bold text-teal-700 bg-teal-50 ring-1 ring-teal-100 rounded-full px-2 py-0.5"
              >
                Grade {cl}
              </span>
            ))}
            {course.classes.length === 0 && (
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

      <div className="px-6 pt-6 pb-3">
        <h2 className="text-[17px] font-extrabold text-slate-900">Assignments</h2>
        <p className="text-[12px] font-semibold text-slate-500">
          Tap an assignment to view its submissions.
        </p>
      </div>

      <div className="px-5 pb-8 flex-1">
        {error ? (
          <ErrorBox message={error} />
        ) : assignments.length === 0 ? (
          <EmptyBox />
        ) : (
          <div className="flex flex-col gap-3">
            {assignments.map((a) => (
              <AssignmentCard key={a.id} assignment={a} courseId={courseId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssignmentCard({ assignment, courseId }) {
  const due = new Date(assignment.dueDate);
  const dueLabel = due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: due.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
  const timeLabel = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const overdue = due.getTime() < Date.now();

  return (
    <Link
      to={`/teacher/school/assignments/${assignment.id}/submissions?courseId=${courseId}`}
      className="bg-white rounded-3xl ring-1 ring-slate-200 shadow-sm p-4 block hover:ring-slate-300 active:scale-[0.99] transition"
    >
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
      <div className="mt-2.5 flex items-center gap-1 text-teal-600">
        <span className="text-[12px] font-extrabold">View submissions</span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

function EmptyBox() {
  return (
    <div className="mx-1 mt-4 rounded-3xl bg-white ring-1 ring-slate-200 p-8 text-center">
      <div className="text-5xl mb-2">📝</div>
      <h3 className="text-[17px] font-extrabold text-slate-900">No assignments yet</h3>
      <p className="mt-1.5 text-[13px] font-medium text-slate-500 max-w-[260px] mx-auto">
        This course has no assignments yet.
      </p>
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
