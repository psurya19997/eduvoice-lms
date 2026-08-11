import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import StudentBottomNav from '../components/StudentBottomNav.jsx';

/**
 * Student Dashboard (PRD §8, UI P20)
 * - Shows live assignments for the student's class at their school,
 *   grouped by course.
 * - Each course card: name, teacher, pending count, progress bar.
 */
export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuthProfile('student');

  const [courseGroups, setCourseGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;
    (async () => {
      setLoading(true);
      setError(null);

      // Pull live assignments where:
      //   - assignment.is_live = true
      //   - assignment_classes contains the student's class
      //   - parent course is_active = true AND school_id = student's school
      const { data, error: aErr } = await supabase
        .from('assignments')
        .select(`
          id, title, due_date,
          assignment_classes!inner ( class ),
          course:courses!inner (
            id, title, is_active, school_id,
            teacher:profiles!courses_teacher_id_fkey ( first_name, last_name )
          )
        `)
        .eq('is_live', true)
        .eq('assignment_classes.class', profile.class)
        .eq('course.is_active', true)
        .eq('course.school_id', profile.school_id)
        .order('due_date', { ascending: true });

      if (aErr) {
        setError(aErr.message);
        setLoading(false);
        return;
      }

      const assignmentIds = (data ?? []).map((a) => a.id);
      let submittedSet = new Set();
      if (assignmentIds.length > 0) {
        const { data: subs, error: sErr } = await supabase
          .from('submissions')
          .select('assignment_id')
          .eq('student_id', user.id)
          .in('assignment_id', assignmentIds);
        if (sErr) {
          setError(sErr.message);
          setLoading(false);
          return;
        }
        submittedSet = new Set((subs ?? []).map((r) => r.assignment_id));
      }

      // Group by course. Track the next-open assignment id per group so
      // tapping the card jumps straight into that assignment's detail page.
      const byCourse = new Map();
      for (const a of data ?? []) {
        const c = a.course;
        if (!c) continue;
        if (!byCourse.has(c.id)) {
          byCourse.set(c.id, {
            id: c.id,
            title: c.title,
            teacherName: c.teacher
              ? `${c.teacher.first_name ?? ''} ${c.teacher.last_name ?? ''}`.trim()
              : 'Teacher',
            total: 0,
            submitted: 0,
            nextAssignmentId: null,
          });
        }
        const g = byCourse.get(c.id);
        g.total += 1;
        const isSubmitted = submittedSet.has(a.id);
        if (isSubmitted) g.submitted += 1;
        // Prefer the first not-yet-submitted assignment (already sorted by
        // due_date asc); fall back to the first assignment overall.
        if (!isSubmitted && !g.nextAssignmentId) g.nextAssignmentId = a.id;
        if (!g.nextAssignmentId) g.nextAssignmentId = a.id;
      }

      setCourseGroups(Array.from(byCourse.values()));
      setLoading(false);
    })();
  }, [user, profile]);

  const firstName = profile?.first_name ?? '';
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const totalPending = courseGroups.reduce(
    (s, g) => s + (g.total - g.submitted),
    0,
  );
  const totalSubmitted = courseGroups.reduce((s, g) => s + g.submitted, 0);

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
              {firstName ? `${firstName} 👋` : 'Student 👋'}
            </h1>
            {profile?.class && (
              <p className="mt-1 text-[12px] font-bold text-indigo-600">
                Grade {profile.class}
              </p>
            )}
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
      </div>

      {/* Stat strip */}
      <div className="px-6 grid grid-cols-2 gap-3">
        <Stat
          label="To do"
          value={totalPending}
          icon="⏳"
          accent="from-pink-500 to-rose-500"
        />
        <Stat
          label="Submitted"
          value={totalSubmitted}
          icon="✅"
          accent="from-emerald-500 to-teal-500"
        />
      </div>

      {/* Games hero */}
      <div className="px-6 pt-6">
        <Link
          to="/student/games"
          className="
            relative block rounded-3xl overflow-hidden
            bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500
            p-4 shadow-lg active:scale-[0.99] transition
          "
        >
          <div className="absolute -right-4 -top-4 text-[110px] opacity-20 leading-none">🎮</div>
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center text-2xl">
              🧩
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/80">
                Game Zone
              </div>
              <div className="text-[16px] font-black text-white leading-tight">
                Play Games →
              </div>
              <div className="mt-0.5 text-[11.5px] font-semibold text-white/85">
                Vocabulary, sentence builder, and more.
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Courses section */}
      <div className="px-6 pt-6 pb-3">
        <h2 className="text-[17px] font-extrabold text-slate-900">Your courses</h2>
        <p className="text-[12px] font-semibold text-slate-500">
          Tap a course to see its assignments.
        </p>
      </div>

      <div className="px-5 pb-6 flex-1">
        {loading ? (
          <CardSkeleton />
        ) : error ? (
          <ErrorBox message={error} />
        ) : courseGroups.length === 0 ? (
          <EmptyBox
            emoji="🎉"
            title="All caught up!"
            body="There are no live assignments for your class right now. Check back later."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {courseGroups.map((g) => (
              <CourseCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </div>

      <StudentBottomNav />
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

function CourseCard({ group }) {
  const pending = group.total - group.submitted;
  const pct = group.total === 0 ? 0 : Math.round((group.submitted / group.total) * 100);
  return (
    <Link
      to={`/student/courses/${group.id}`}
      className="
        relative bg-white rounded-3xl ring-1 ring-slate-200 p-4
        hover:ring-slate-300 active:scale-[0.99] transition
        shadow-sm
      "
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl shadow-md shrink-0">
          📘
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-extrabold text-slate-900 truncate">
            {group.title}
          </div>
          <div className="mt-0.5 text-[11.5px] font-semibold text-slate-500 truncate">
            with {group.teacherName}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-[18px] font-black leading-none ${pending > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {pending}
          </div>
          <div className="text-[10px] font-bold text-slate-500 mt-0.5">pending</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-bold text-slate-500">
            {group.submitted} of {group.total} submitted
          </div>
          <div className="text-[11px] font-extrabold text-indigo-600">{pct}%</div>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

function EmptyBox({ emoji, title, body }) {
  return (
    <div className="mx-1 mt-4 rounded-3xl bg-white ring-1 ring-slate-200 p-8 text-center">
      <div className="text-5xl mb-2">{emoji}</div>
      <h3 className="text-[17px] font-extrabold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-[13px] font-medium text-slate-500 max-w-[260px] mx-auto">
        {body}
      </p>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[110px] rounded-3xl bg-white ring-1 ring-slate-200 animate-pulse" />
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
