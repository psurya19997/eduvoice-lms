import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function TeacherAssignmentDetail() {
  const { id: assignmentId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthProfile('teacher');

  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !assignmentId) return;
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
          course:courses!inner ( id, title, teacher_id )
        `)
        .eq('id', assignmentId)
        .maybeSingle();

      if (aErr) { setError(aErr.message); setLoading(false); return; }
      if (!a || a.course?.teacher_id !== user.id) {
        navigate('/teacher', { replace: true });
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
        isLive: a.is_live,
        classes: (a.assignment_classes ?? []).map((r) => r.class).sort((a, b) => a - b),
        courseId: a.course.id,
        courseTitle: a.course.title,
      });
      setLoading(false);
    })();
  }, [user, assignmentId, navigate]);

  if (authLoading || loading) return <FullScreenSpinner />;
  if (!assignment) return null;

  const due = new Date(assignment.dueDate);
  const dueLabel = due.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    year: due.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
  const timeLabel = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const overdue = due.getTime() < Date.now();

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to={`/teacher/courses/${assignment.courseId}`} />
      </div>

      {/* Header */}
      <div className="px-6 pt-3">
        <p className="text-[12px] font-bold text-indigo-600 truncate">{assignment.courseTitle}</p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <h1 className="text-[24px] leading-tight font-black text-slate-900">
            {assignment.title}
          </h1>
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
        <div className={`mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold ${overdue ? 'text-rose-600' : 'text-slate-600'}`}>
          <span>⏰</span>
          <span>Due {dueLabel} · {timeLabel}</span>
          {assignment.acceptLate && (
            <span className="ml-1 text-[10px] font-extrabold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
              LATE OK
            </span>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="px-5 pt-5">
        <SectionLabel>Instructions</SectionLabel>
        <div className="mt-1.5 bg-white ring-1 ring-slate-200 rounded-2xl p-4">
          {assignment.instructions ? (
            <p className="text-[14px] font-medium text-slate-700 whitespace-pre-wrap">
              {assignment.instructions}
            </p>
          ) : (
            <p className="text-[13px] font-semibold text-slate-400 italic">No instructions provided.</p>
          )}

          {assignment.instructionFileUrl && assignment.instructionType === 'image' && (
            <div className="mt-3">
              <img
                src={assignment.instructionFileUrl}
                alt="Instruction"
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
              <div className="w-10 h-10 rounded-xl bg-rose-50 ring-1 ring-rose-100 flex items-center justify-center text-xl shrink-0">📄</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-extrabold text-slate-900 truncate">
                  {inferFileName(assignment.instructionFileUrl, 'instruction.pdf')}
                </div>
                <div className="text-[11px] font-semibold text-slate-500">PDF document</div>
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

          {assignment.instructionFileUrl && assignment.instructionType === 'link' && (
            <LinkInstruction url={assignment.instructionFileUrl} />
          )}
        </div>
      </div>

      {/* Allowed submission types */}
      <div className="px-5 pt-4">
        <SectionLabel>Allowed submission types</SectionLabel>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {assignment.allowedTypes.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </div>
      </div>

      {/* Target classes */}
      <div className="px-5 pt-4">
        <SectionLabel>Target classes</SectionLabel>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {assignment.classes.length > 0 ? assignment.classes.map((cl) => (
            <span
              key={cl}
              className="text-[12px] font-extrabold text-indigo-700 bg-indigo-50 ring-1 ring-indigo-100 rounded-full px-3 py-1"
            >
              Grade {cl}
            </span>
          )) : (
            <span className="text-[13px] font-semibold text-slate-400">No classes set</span>
          )}
        </div>
      </div>

      {/* Scoring */}
      <div className="px-5 pt-4">
        <SectionLabel>Scoring</SectionLabel>
        <div className="mt-1.5 bg-white ring-1 ring-slate-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">⭐</div>
          <div>
            <div className="text-[14px] font-extrabold text-slate-900">Teacher score: {assignment.teacherScore}</div>
            <div className="text-[11.5px] font-semibold text-slate-500">Plus bonus points for total &amp; unique words.</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-5 pt-4">
          <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
            <p className="text-[13px] font-semibold text-rose-700">{error}</p>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="px-5 pt-6 pb-8 mt-auto">
        <Link
          to={`/teacher/assignments/${assignment.id}/submissions`}
          className="
            w-full h-14 rounded-2xl bg-indigo-600 text-white
            text-base font-extrabold shadow-lg shadow-indigo-600/30
            flex items-center justify-center gap-2
            active:scale-[0.98] transition
          "
        >
          👀 View submissions
        </Link>
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

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null;
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1].split('?')[0] || null;
      return u.searchParams.get('v');
    }
  } catch { /* invalid url */ }
  return null;
}

function LinkInstruction({ url }) {
  const ytId = extractYouTubeId(url);
  if (ytId) {
    return (
      <div className="mt-3 rounded-xl overflow-hidden ring-1 ring-slate-200" style={{ aspectRatio: '16/9' }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${ytId}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Video"
        />
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-3 flex items-center gap-3 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 p-3 active:scale-[0.98] transition"
    >
      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl shrink-0">🔗</div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-extrabold text-indigo-700 truncate">{url}</div>
        <div className="text-[11px] font-semibold text-indigo-500">Tap to open link</div>
      </div>
    </a>
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
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 text-[12px] px-3 py-1 font-extrabold ${cfg.cls}`}>
      <span>{cfg.emoji}</span>
      <span>{cfg.label}</span>
    </span>
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
