import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

/**
 * Create Course (PRD §6.2)
 * - Name + description
 * - Target classes: multi-select Grade 1-12
 * - Inserts into `courses` (teacher_id, school_id) + `course_classes`
 *
 * If the teacher belongs to multiple schools, we let them pick which one
 * to create the course under (only approved + active memberships shown).
 */
export default function TeacherCourseNew() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthProfile('teacher');

  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classes, setClasses] = useState(new Set()); // Set<number>
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('teacher_schools')
        .select('school_id, schools(id, name, is_active)')
        .eq('teacher_id', user.id)
        .eq('is_approved', true)
        .eq('is_active', true);
      if (error) {
        setError(error.message);
        return;
      }
      const active = (data ?? []).filter((r) => r.schools?.is_active);
      setSchools(active);
      if (active.length > 0) setSchoolId(active[0].school_id);
    })();
  }, [user]);

  const toggleClass = (n) => {
    setClasses((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const canSubmit =
    !!user &&
    !!schoolId &&
    title.trim().length >= 2 &&
    classes.size > 0 &&
    !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const { data: course, error: cErr } = await supabase
      .from('courses')
      .insert({
        teacher_id: user.id,
        school_id: schoolId,
        title: title.trim(),
        description: description.trim() || null,
        is_active: true,
      })
      .select('id')
      .single();

    if (cErr) {
      setSubmitting(false);
      if (/courses_title_school_unique/.test(cErr.message)) {
        setError('A course with this name already exists at this school.');
      } else {
        setError(cErr.message);
      }
      return;
    }

    const classRows = Array.from(classes).map((n) => ({
      course_id: course.id,
      class: n,
    }));
    const { error: ccErr } = await supabase.from('course_classes').insert(classRows);
    if (ccErr) {
      setSubmitting(false);
      setError(`Course created, but couldn't set classes: ${ccErr.message}`);
      return;
    }

    setSubmitting(false);
    navigate('/teacher', { replace: true });
  };

  if (authLoading) return <FullScreenSpinner />;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/teacher" />
      </div>

      <div className="px-6 pt-3">
        <h1 className="text-[26px] leading-tight font-black text-slate-900">
          New course
        </h1>
        <p className="mt-1.5 text-[15px] font-medium text-slate-500">
          Set a name and the grades this course is for.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-5 pt-6 pb-8 gap-4">
        {schools.length > 1 && (
          <Field id="school" label="School">
            <div className="relative">
              <select
                id="school"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className={selectClass}
              >
                {schools.map((s) => (
                  <option key={s.school_id} value={s.school_id}>
                    {s.schools?.name}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </div>
          </Field>
        )}

        <Field id="title" label="Course name">
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. English Conversation"
            className={inputClass}
            maxLength={80}
          />
        </Field>

        <Field id="description" label="Description (optional)">
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description of what this course covers."
            rows={3}
            className={`${inputClass} !h-auto py-3 resize-none`}
            maxLength={300}
          />
          <div className="mt-1 text-right text-[11px] font-semibold text-slate-400 pr-1">
            {description.length}/300
          </div>
        </Field>

        <div>
          <div className="flex items-end justify-between mb-1.5 pl-1">
            <div className="text-[13px] font-bold text-slate-700">Target classes</div>
            <div className="text-[11.5px] font-semibold text-slate-500">
              {classes.size} selected
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
              const on = classes.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleClass(n)}
                  className={`
                    h-12 rounded-xl text-[13px] font-extrabold
                    ring-1 transition active:scale-95
                    ${on
                      ? 'bg-indigo-600 text-white ring-indigo-600 shadow-md shadow-indigo-600/30'
                      : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300'}
                  `}
                >
                  Grade {n}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
            <p className="text-[13px] font-semibold text-rose-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={`
            mt-auto w-full h-14 rounded-2xl text-base font-extrabold
            flex items-center justify-center gap-2 transition
            ${canSubmit
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
          `}
        >
          {submitting ? <Spinner /> : 'Create course'}
        </button>
      </form>
    </div>
  );
}

const inputClass = `
  w-full h-14 rounded-2xl bg-white
  ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500
  px-4 text-[15px] font-semibold text-slate-900 placeholder:text-slate-400
  outline-none transition
`;

const selectClass = `
  w-full h-14 rounded-2xl bg-white
  ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500
  px-4 pr-11 text-[15px] font-semibold text-slate-900
  appearance-none outline-none transition
`;

function Field({ id, label, children }) {
  return (
    <label htmlFor={id} className="block">
      <div className="text-[13px] font-bold text-slate-700 mb-1.5 pl-1">{label}</div>
      {children}
    </label>
  );
}

function ChevronDown() {
  return (
    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
