import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import TeacherBottomNav from '../components/TeacherBottomNav.jsx';

/**
 * Teacher Dashboard (PRD §2.3, §6, UI P15)
 * - Lists courses owned by the current teacher.
 * - School switcher shown only when the teacher belongs to more than one.
 * - Bottom nav + "+ New Course" CTA.
 */
export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuthProfile('teacher');

  const [schools, setSchools] = useState([]);         // { school_id, schools: { name } }
  const [activeSchoolId, setActiveSchoolId] = useState('');
  const [courses, setCourses] = useState([]);         // with counts
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  // Load teacher's approved & active school memberships.
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('teacher_schools')
        .select('school_id, is_approved, is_active, schools(id, name, is_active)')
        .eq('teacher_id', user.id)
        .eq('is_approved', true)
        .eq('is_active', true);
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const active = (data ?? []).filter((r) => r.schools?.is_active);
      setSchools(active);
      if (active.length > 0) {
        setActiveSchoolId((prev) => prev || active[0].school_id);
      } else {
        setLoading(false);
      }
    })();
  }, [user]);

  // Load courses + aggregate assignment counts for the active school.
  useEffect(() => {
    if (!user || !activeSchoolId) return;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: courseRows, error: cErr } = await supabase
        .from('courses')
        .select(`
          id, title, description, is_active, created_at,
          course_classes ( class ),
          assignments ( id )
        `)
        .eq('teacher_id', user.id)
        .eq('school_id', activeSchoolId)
        .order('created_at', { ascending: false });
      if (cErr) {
        setError(cErr.message);
        setLoading(false);
        return;
      }
      const shaped = (courseRows ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        isActive: c.is_active,
        classes: (c.course_classes ?? []).map((r) => r.class).sort((a, b) => a - b),
        assignmentCount: (c.assignments ?? []).length,
      }));
      setCourses(shaped);
      setLoading(false);
    })();
  }, [user, activeSchoolId]);

  const firstName = profile?.first_name ?? '';
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  if (authLoading) return <FullScreenSpinner />;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-slate-500">{greeting},</p>
            <h1 className="text-[24px] leading-tight font-black text-slate-900 truncate">
              {firstName ? `${firstName} 👋` : 'Teacher 👋'}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="shrink-0 h-10 px-3 rounded-xl bg-white ring-1 ring-slate-200 text-[12px] font-bold text-slate-600 hover:text-slate-800"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>

        {/* School switcher (only if 2+) */}
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

      {/* Stat strip */}
      <div className="px-6 grid grid-cols-2 gap-3">
        <Stat
          label="Courses"
          value={courses.length}
          icon="📚"
          accent="from-indigo-500 to-violet-600"
        />
        <Stat
          label="Assignments"
          value={courses.reduce((s, c) => s + c.assignmentCount, 0)}
          icon="📝"
          accent="from-pink-500 to-rose-500"
        />
      </div>

      {/* Courses section */}
      <div className="px-6 pt-6 pb-4 flex items-end justify-between">
        <div>
          <h2 className="text-[17px] font-extrabold text-slate-900">Your courses</h2>
          <p className="text-[12px] font-semibold text-slate-500">
            Tap a course to manage its assignments.
          </p>
        </div>
        <Link
          to="/teacher/courses/new"
          className="
            h-10 px-3 rounded-xl bg-indigo-600 text-white
            text-[13px] font-extrabold
            flex items-center gap-1.5
            shadow-md shadow-indigo-600/30 active:scale-[0.98] transition
          "
        >
          <span className="text-[16px] leading-none">＋</span>
          New course
        </Link>
      </div>

      <div className="px-5 pb-6 flex-1">
        {loading ? (
          <CardSkeleton />
        ) : error ? (
          <ErrorBox message={error} />
        ) : schools.length === 0 ? (
          <EmptyBox
            emoji="⏳"
            title="Waiting for school approval"
            body="Your teacher account isn't approved at any school yet. Ask your principal to approve you from their dashboard."
          />
        ) : courses.length === 0 ? (
          <EmptyBox
            emoji="✨"
            title="No courses yet"
            body="Create your first course to start adding audio-based assignments."
            ctaLabel="Create a course"
            ctaTo="/teacher/courses/new"
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

/* ---------- pieces ---------- */

function Stat({ label, value, icon, accent }) {
  return (
    <div className="relative rounded-2xl bg-white ring-1 ring-slate-200 p-4 overflow-hidden">
      <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full bg-gradient-to-br ${accent} opacity-20`} />
      <div className="text-[20px]">{icon}</div>
      <div className="mt-1 text-[24px] font-black text-slate-900 leading-none">{value}</div>
      <div className="mt-1 text-[12px] font-bold text-slate-500">{label}</div>
    </div>
  );
}

function CourseCard({ course }) {
  return (
    <Link
      to={`/teacher/courses/${course.id}`}
      className="
        relative bg-white rounded-3xl ring-1 ring-slate-200 p-4
        flex items-center gap-3
        hover:ring-slate-300 active:scale-[0.99] transition
        shadow-sm
      "
    >
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl shadow-md shrink-0">
        📘
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[15px] font-extrabold text-slate-900 truncate">{course.title}</div>
          {!course.isActive && (
            <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
              DISABLED
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center flex-wrap gap-1.5">
          {course.classes.length > 0 ? (
            course.classes.map((cl) => (
              <span
                key={cl}
                className="text-[10.5px] font-bold text-indigo-700 bg-indigo-50 ring-1 ring-indigo-100 rounded-full px-2 py-0.5"
              >
                G{cl}
              </span>
            ))
          ) : (
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

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[88px] rounded-3xl bg-white ring-1 ring-slate-200 animate-pulse" />
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
