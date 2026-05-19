import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import TeacherBottomNav from '../components/TeacherBottomNav.jsx';

export default function SchoolCourses() {
  const { user, loading: authLoading } = useAuthProfile('teacher');
  const [schools, setSchools] = useState([]);
  const [activeSchoolId, setActiveSchoolId] = useState('');
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('teacher_schools')
        .select('school_id, schools(id, name, is_active)')
        .eq('teacher_id', user.id)
        .eq('is_approved', true)
        .eq('is_active', true);
      if (error) { setError(error.message); setLoading(false); return; }
      const active = (data ?? []).filter((r) => r.schools?.is_active);
      setSchools(active);
      if (active.length > 0) setActiveSchoolId(active[0].school_id);
      else setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !activeSchoolId) return;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('courses')
        .select(`
          id, title, created_at,
          teacher:profiles!courses_teacher_id_fkey(first_name, last_name),
          course_classes(class),
          assignments(id)
        `)
        .eq('school_id', activeSchoolId)
        .eq('is_active', true)
        .neq('teacher_id', user.id)
        .order('created_at', { ascending: false });
      if (error) { setError(error.message); setLoading(false); return; }
      setCourses(
        (data ?? []).map((c) => ({
          id: c.id,
          title: c.title,
          teacherName: c.teacher
            ? `${c.teacher.first_name ?? ''} ${c.teacher.last_name ?? ''}`.trim()
            : 'Teacher',
          classes: (c.course_classes ?? []).map((r) => r.class).sort((a, b) => a - b),
          assignmentCount: (c.assignments ?? []).length,
        })),
      );
      setLoading(false);
    })();
  }, [user, activeSchoolId]);

  if (authLoading) return <FullScreenSpinner />;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-[24px] leading-tight font-black text-slate-900">School Courses</h1>
        <p className="text-[13px] font-semibold text-slate-500">
          All courses at your school · view only
        </p>

        {schools.length > 1 && (
          <div className="mt-4 relative">
            <select
              value={activeSchoolId}
              onChange={(e) => setActiveSchoolId(e.target.value)}
              className="
                w-full h-12 rounded-2xl bg-white ring-1 ring-slate-200
                px-4 pr-11 text-[14px] font-bold text-slate-800
                appearance-none outline-none focus:ring-2 focus:ring-indigo-500
              "
            >
              {schools.map((s) => (
                <option key={s.school_id} value={s.school_id}>
                  🏫 {s.schools?.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pb-8 flex-1">
        {loading ? (
          <CardSkeleton />
        ) : error ? (
          <ErrorBox message={error} />
        ) : schools.length === 0 ? (
          <EmptyBox
            emoji="⏳"
            title="No approved schools"
            body="You aren't approved at any school yet."
          />
        ) : courses.length === 0 ? (
          <EmptyBox
            emoji="📭"
            title="No courses yet"
            body="No courses have been created at this school."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </div>

      <TeacherBottomNav />
    </div>
  );
}

function CourseCard({ course }) {
  return (
    <Link
      to={`/teacher/school/courses/${course.id}`}
      className="
        relative bg-white rounded-3xl ring-1 ring-slate-200 p-4
        flex items-center gap-3
        hover:ring-slate-300 active:scale-[0.99] transition shadow-sm
      "
    >
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-2xl shadow-md shrink-0">
        📗
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-extrabold text-slate-900 truncate">{course.title}</div>
        <div className="mt-0.5 text-[12px] font-bold text-slate-400 truncate">
          {course.teacherName}
        </div>
        <div className="mt-1.5 flex items-center flex-wrap gap-1.5">
          {course.classes.map((cl) => (
            <span
              key={cl}
              className="text-[10.5px] font-bold text-teal-700 bg-teal-50 ring-1 ring-teal-100 rounded-full px-2 py-0.5"
            >
              G{cl}
            </span>
          ))}
          {course.classes.length === 0 && (
            <span className="text-[11px] font-semibold text-slate-400">No classes set</span>
          )}
        </div>
        <div className="mt-1.5 text-[11.5px] font-semibold text-slate-500">
          {course.assignmentCount} assignment{course.assignmentCount === 1 ? '' : 's'}
        </div>
      </div>
      <div className="shrink-0 text-slate-300">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
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

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[104px] rounded-3xl bg-white ring-1 ring-slate-200 animate-pulse" />
      ))}
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
