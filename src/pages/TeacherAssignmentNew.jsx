import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

/**
 * Create Assignment (PRD §7.1)
 * - Title + instructions
 * - Allowed submission types: text / image / audio (multi)
 * - Target classes: limited to classes assigned to the parent course
 * - Due date (datetime), accept-late toggle, teacher score
 * - Inserts `assignments` (is_live=true) + `assignment_classes`
 */
export default function TeacherAssignmentNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const courseId = params.get('courseId');
  const { user, loading: authLoading } = useAuthProfile('teacher');

  const [course, setCourse] = useState(null);
  const [loadingCourse, setLoadingCourse] = useState(true);

  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [types, setTypes] = useState(new Set(['audio']));
  const [classes, setClasses] = useState(new Set());
  const [dueDate, setDueDate] = useState(() => defaultDueDate());
  const [acceptLate, setAcceptLate] = useState(false);
  const [teacherScore, setTeacherScore] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Optional instruction media (image or audio brief).
  const [mediaKind, setMediaKind] = useState('none'); // 'none' | 'image' | 'audio'
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [recording, setRecording] = useState(false);
  const mrRef = useRef(null);
  const streamRef = useRef(null);

  const pickMedia = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(f);
    setMediaPreview(URL.createObjectURL(f));
  };
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (ev) => chunks.push(ev.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        if (mediaPreview) URL.revokeObjectURL(mediaPreview);
        setMediaFile(blob); setMediaPreview(URL.createObjectURL(blob));
      };
      mr.start(); mrRef.current = mr; setRecording(true);
    } catch (err) { setError(err.message); }
  };
  const stopRec = () => {
    mrRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  };

  useEffect(() => {
    if (!user || !courseId) return;
    (async () => {
      setLoadingCourse(true);
      const { data: c, error: cErr } = await supabase
        .from('courses')
        .select('id, title, teacher_id, course_classes(class)')
        .eq('id', courseId)
        .maybeSingle();

      if (cErr) {
        setError(cErr.message);
        setLoadingCourse(false);
        return;
      }
      if (!c || c.teacher_id !== user.id) {
        navigate('/teacher', { replace: true });
        return;
      }
      const courseClasses = (c.course_classes ?? [])
        .map((r) => r.class)
        .sort((a, b) => a - b);
      setCourse({ id: c.id, title: c.title, classes: courseClasses });
      // Default: all course classes selected
      setClasses(new Set(courseClasses));
      setLoadingCourse(false);
    })();
  }, [user, courseId, navigate]);

  const toggleType = (t) => {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const toggleClass = (n) => {
    setClasses((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const canSubmit = useMemo(() => {
    if (!user || !course) return false;
    if (title.trim().length < 2) return false;
    if (types.size === 0) return false;
    if (classes.size === 0) return false;
    if (!dueDate) return false;
    if (!Number.isFinite(Number(teacherScore)) || Number(teacherScore) < 0) return false;
    return !submitting;
  }, [user, course, title, types, classes, dueDate, teacherScore, submitting]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const dueIso = new Date(dueDate).toISOString();

    // Upload instruction media (optional) before creating the assignment.
    let instruction_file_url = null;
    let instruction_type = 'text';
    if (mediaKind !== 'none' && mediaFile) {
      const ext = mediaKind === 'audio'
        ? (mediaFile.type?.includes('ogg') ? 'ogg' : mediaFile.type?.includes('mp4') ? 'm4a' : 'webm')
        : (/\.([a-z0-9]+)$/i.exec(mediaFile.name || '')?.[1] || 'jpg').toLowerCase();
      const path = `${user.id}/${courseId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('assignment-briefs')
        .upload(path, mediaFile, { contentType: mediaFile.type || (mediaKind === 'audio' ? 'audio/webm' : 'image/jpeg'), upsert: false });
      if (upErr) { setSubmitting(false); setError(`Media upload failed: ${upErr.message}`); return; }
      const { data: pub } = supabase.storage.from('assignment-briefs').getPublicUrl(path);
      instruction_file_url = pub?.publicUrl ?? path;
      instruction_type = mediaKind;
    }

    const { data: assignment, error: aErr } = await supabase
      .from('assignments')
      .insert({
        course_id: course.id,
        title: title.trim(),
        instructions: instructions.trim() || null,
        instruction_file_url,
        instruction_type,
        allowed_submission_types: Array.from(types),
        due_date: dueIso,
        accept_late_submissions: acceptLate,
        teacher_score: Number(teacherScore),
        is_live: true,
      })
      .select('id')
      .single();

    if (aErr) {
      setSubmitting(false);
      setError(aErr.message);
      return;
    }

    const classRows = Array.from(classes).map((n) => ({
      assignment_id: assignment.id,
      class: n,
    }));
    const { error: acErr } = await supabase
      .from('assignment_classes')
      .insert(classRows);

    if (acErr) {
      setSubmitting(false);
      setError(`Assignment created, but couldn't set classes: ${acErr.message}`);
      return;
    }

    setSubmitting(false);
    navigate(`/teacher/courses/${course.id}`, { replace: true });
  };

  if (authLoading || loadingCourse) return <FullScreenSpinner />;
  if (!course) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to={`/teacher/courses/${course.id}`} />
      </div>

      <div className="px-6 pt-3">
        <h1 className="text-[26px] leading-tight font-black text-slate-900">
          New assignment
        </h1>
        <p className="mt-1.5 text-[15px] font-medium text-slate-500 truncate">
          For <span className="font-bold text-slate-700">{course.title}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-5 pt-6 pb-8 gap-4">
        <Field id="title" label="Title">
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Describe your morning"
            className={inputClass}
            maxLength={120}
          />
        </Field>

        <Field id="instructions" label="Instructions (optional)">
          <textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="What should students do? Prompt, context, tips."
            rows={4}
            className={`${inputClass} !h-auto py-3 resize-none`}
            maxLength={1000}
          />
          <div className="mt-1 text-right text-[11px] font-semibold text-slate-400 pr-1">
            {instructions.length}/1000
          </div>
        </Field>

        <div>
          <div className="text-[13px] font-bold text-slate-700 mb-1.5 pl-1">Instruction media (optional)</div>
          <div className="grid grid-cols-3 gap-2">
            {[['none','None','🚫'],['image','Image','🖼️'],['audio','Audio','🎤']].map(([k, label, emoji]) => (
              <button key={k} type="button" onClick={() => { setMediaKind(k); setMediaFile(null); if (mediaPreview) { URL.revokeObjectURL(mediaPreview); setMediaPreview(null); } }}
                className={`h-12 rounded-xl text-[12.5px] font-extrabold ring-1 flex items-center justify-center gap-1.5
                  ${mediaKind === k ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-200'}`}>
                <span>{emoji}</span><span>{label}</span>
              </button>
            ))}
          </div>
          {mediaKind === 'image' && (
            <div className="mt-2">
              {mediaPreview ? <img src={mediaPreview} alt="" className="w-full rounded-xl ring-1 ring-slate-200 max-h-56 object-contain bg-slate-50" />
                : <label className="w-full h-24 rounded-xl bg-white ring-1 ring-dashed ring-slate-300 flex items-center justify-center text-[13px] font-extrabold text-slate-500 cursor-pointer">📷 Pick an image<input type="file" accept="image/*" onChange={pickMedia} className="hidden" /></label>}
            </div>
          )}
          {mediaKind === 'audio' && (
            <div className="mt-2 bg-white ring-1 ring-slate-200 rounded-xl p-3 flex flex-col items-center gap-2">
              {!recording && !mediaPreview && <button type="button" onClick={startRec} className="h-10 px-4 rounded-xl bg-rose-500 text-white text-[12.5px] font-extrabold">🎤 Record</button>}
              {recording && <button type="button" onClick={stopRec} className="h-10 px-4 rounded-xl bg-slate-900 text-white text-[12.5px] font-extrabold">■ Stop</button>}
              {!recording && mediaPreview && <><audio controls src={mediaPreview} className="w-full" /><button type="button" onClick={startRec} className="h-9 px-3 rounded-xl bg-slate-100 text-slate-700 text-[12px] font-extrabold">Re-record</button></>}
            </div>
          )}
        </div>

        <div>
          <div className="text-[13px] font-bold text-slate-700 mb-1.5 pl-1">
            Allowed submission types
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { t: 'text', label: 'Text', emoji: '✍️' },
              { t: 'image', label: 'Image', emoji: '🖼️' },
              { t: 'audio', label: 'Audio', emoji: '🎤' },
            ].map(({ t, label, emoji }) => {
              const on = types.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`
                    h-14 rounded-2xl text-[13px] font-extrabold
                    ring-1 transition active:scale-95
                    flex flex-col items-center justify-center gap-0.5
                    ${on
                      ? 'bg-indigo-600 text-white ring-indigo-600 shadow-md shadow-indigo-600/30'
                      : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300'}
                  `}
                >
                  <span className="text-[16px] leading-none">{emoji}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between mb-1.5 pl-1">
            <div className="text-[13px] font-bold text-slate-700">Target classes</div>
            <div className="text-[11.5px] font-semibold text-slate-500">
              {classes.size} selected
            </div>
          </div>
          {course.classes.length === 0 ? (
            <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3">
              <p className="text-[13px] font-semibold text-amber-800">
                This course has no grades assigned. Edit the course to add grades first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {course.classes.map((n) => {
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
          )}
        </div>

        <Field id="dueDate" label="Due date">
          <input
            id="dueDate"
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="flex items-center justify-between bg-white ring-1 ring-slate-200 rounded-2xl px-4 py-3">
          <div className="min-w-0 pr-3">
            <div className="text-[13.5px] font-bold text-slate-800">
              Accept late submissions
            </div>
            <div className="text-[11.5px] font-semibold text-slate-500">
              Allow students to submit after the due date.
            </div>
          </div>
          <Toggle on={acceptLate} onChange={setAcceptLate} />
        </div>

        <Field id="teacherScore" label="Teacher score">
          <input
            id="teacherScore"
            type="number"
            min={0}
            step={1}
            value={teacherScore}
            onChange={(e) => setTeacherScore(e.target.value)}
            className={inputClass}
          />
        </Field>

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
          {submitting ? <Spinner /> : 'Create assignment'}
        </button>
      </form>
    </div>
  );
}

/* ---------- helpers ---------- */

function defaultDueDate() {
  // Default: 1 week from now, rounded to nearest hour, local time.
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

const inputClass = `
  w-full h-14 rounded-2xl bg-white
  ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500
  px-4 text-[15px] font-semibold text-slate-900 placeholder:text-slate-400
  outline-none transition
`;

function Field({ id, label, children }) {
  return (
    <label htmlFor={id} className="block">
      <div className="text-[13px] font-bold text-slate-700 mb-1.5 pl-1">{label}</div>
      {children}
    </label>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`
        shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition
        ${on ? 'bg-indigo-600' : 'bg-slate-300'} active:scale-95
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
