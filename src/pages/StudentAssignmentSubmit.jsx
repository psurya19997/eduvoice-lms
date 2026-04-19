import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

/**
 * Student — Submit Assignment
 *
 * - Loads the assignment, validates class + live + course active.
 * - Redirects to detail page if the student already submitted.
 * - Shows only the tabs allowed by assignment.allowed_submission_types.
 * - On submit:
 *     1. Confirmation modal ("You cannot resubmit.")
 *     2. For image/audio: upload to 'submissions' bucket.
 *     3. Insert into `submissions` (text_content or file_url per type).
 *     4. For text & audio: compute total_words locally and persist it.
 *        Audio transcript captured live via Web Speech API.
 *     5. Call `supabase.rpc('recalculate_student_scores', { p_submission_id })`.
 *     6. Navigate to /student.
 */
export default function StudentAssignmentSubmit() {
  const { id: assignmentId } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuthProfile('student');

  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [tab, setTab] = useState(null);

  // Text state
  const [textValue, setTextValue] = useState('');

  // Image state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Audio state
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const MAX_AUDIO_MS = 3 * 60 * 1000; // 3 minutes

  // Submit state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !profile || !assignmentId) return;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: a, error: aErr } = await supabase
        .from('assignments')
        .select(`
          id, title, due_date, accept_late_submissions, is_live,
          allowed_submission_types,
          assignment_classes ( class ),
          course:courses!inner ( id, is_active, school_id )
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
      const classes = (a.assignment_classes ?? []).map((r) => r.class);
      const allowed =
        a.is_live &&
        a.course?.is_active &&
        a.course?.school_id === profile.school_id &&
        classes.includes(profile.class);
      if (!allowed) {
        navigate('/student', { replace: true });
        return;
      }

      // Late gate: if past due and not accepting late, block submission.
      const overdue = new Date(a.due_date).getTime() < Date.now();
      if (overdue && !a.accept_late_submissions) {
        navigate(`/student/assignments/${assignmentId}`, { replace: true });
        return;
      }

      // If already submitted → send to detail page.
      const { data: existing } = await supabase
        .from('submissions')
        .select('id')
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
        .maybeSingle();
      if (existing) {
        navigate(`/student/assignments/${assignmentId}`, { replace: true });
        return;
      }

      const allowedTypes = (a.allowed_submission_types ?? []).filter((t) =>
        ['text', 'image', 'audio'].includes(t),
      );
      setAssignment({
        id: a.id,
        title: a.title,
        allowedTypes,
      });
      setTab(allowedTypes[0] ?? null);
      setLoading(false);
    })();
  }, [user, profile, assignmentId, navigate]);

  // Clean up any active recording on unmount / tab change.
  useEffect(() => {
    return () => stopRecordingCleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Switching tab drops previous tab's picked data to avoid confusion.
    if (tab !== 'text') setTextValue('');
    if (tab !== 'image') {
      setImageFile(null);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    if (tab !== 'audio') {
      stopRecordingCleanup();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      setElapsedMs(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* ---------- audio recording ---------- */

  const startRecording = async () => {
    try {
      setError(null);
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setTranscript('');
      setElapsedMs(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };
      mr.start();
      mediaRecorderRef.current = mr;

      // Web Speech API — live transcription while recording.
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = navigator.language || 'en-US';
        rec.onresult = (e) => {
          let finalChunk = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalChunk += e.results[i][0].transcript + ' ';
          }
          if (finalChunk) setTranscript((prev) => (prev + finalChunk).trim() + ' ');
        };
        rec.onerror = () => {};
        try { rec.start(); } catch { /* already running */ }
        recognitionRef.current = rec;
      }

      setRecording(true);
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const ms = Date.now() - startedAt;
        setElapsedMs(ms);
        if (ms >= MAX_AUDIO_MS) stopRecording();
      }, 200);
    } catch (err) {
      setError(err.message || 'Could not access the microphone.');
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
  };

  const stopRecordingCleanup = () => {
    stopRecording();
  };

  const reRecord = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setElapsedMs(0);
  };

  /* ---------- image pick ---------- */

  const onImagePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  /* ---------- submission ---------- */

  const canConfirm = useMemo(() => {
    if (!assignment || !tab) return false;
    if (submitting) return false;
    if (tab === 'text') return textValue.trim().length > 0;
    if (tab === 'image') return !!imageFile;
    if (tab === 'audio') return !!audioBlob && !recording;
    return false;
  }, [assignment, tab, textValue, imageFile, audioBlob, recording, submitting]);

  const doSubmit = async () => {
    if (!canConfirm || !user || !assignment) return;
    setSubmitting(true);
    setError(null);

    try {
      let file_url = null;
      let text_content = null;
      let submission_total_words = null;
      let submission_transcript = null;
      const submission_type = tab;

      if (tab === 'text') {
        text_content = textValue.trim();
        submission_total_words = countWords(text_content);
      }

      if (tab === 'image') {
        const ext = fileExt(imageFile.name, 'jpg');
        const path = `${user.id}/${assignment.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('submissions')
          .upload(path, imageFile, {
            contentType: imageFile.type || 'image/jpeg',
            upsert: false,
          });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('submissions').getPublicUrl(path);
        file_url = pub?.publicUrl ?? path;
      }

      if (tab === 'audio') {
        const ext = audioBlob.type.includes('mp4') ? 'm4a'
                  : audioBlob.type.includes('ogg') ? 'ogg'
                  : 'webm';
        const path = `${user.id}/${assignment.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('submissions')
          .upload(path, audioBlob, {
            contentType: audioBlob.type || 'audio/webm',
            upsert: false,
          });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('submissions').getPublicUrl(path);
        file_url = pub?.publicUrl ?? path;

        submission_transcript = transcript.trim() || null;
        submission_total_words = countWords(submission_transcript ?? '');
      }

      const row = {
        assignment_id: assignment.id,
        student_id: user.id,
        submission_type,
        text_content,
        file_url,
        transcript: submission_transcript,
        total_words: submission_total_words,
        unique_words: null, // aggregated at period level by the RPC
        is_visible: true,
      };

      const { data: inserted, error: insErr } = await supabase
        .from('submissions')
        .insert(row)
        .select('id')
        .single();
      if (insErr) throw insErr;

      // Trigger score rollup for the period this submission belongs to.
      const { error: rpcErr } = await supabase.rpc('recalculate_student_scores', {
        p_submission_id: inserted.id,
      });
      if (rpcErr) {
        // Non-fatal for the student; log and keep going.
        console.error('[Submit] recalculate_student_scores failed:', rpcErr);
      }

      setConfirmOpen(false);
      navigate('/student', { replace: true });
    } catch (err) {
      console.error('[Submit] failed:', err);
      setError(err.message || 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) return <FullScreenSpinner />;
  if (!assignment) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to={`/student/assignments/${assignment.id}`} />
      </div>

      <div className="px-6 pt-3">
        <p className="text-[12px] font-bold text-indigo-600">Submit</p>
        <h1 className="mt-1 text-[22px] leading-tight font-black text-slate-900">
          {assignment.title}
        </h1>
        <p className="mt-1.5 text-[13px] font-semibold text-slate-500">
          Pick how you'd like to submit.
        </p>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-5">
        <div className={`grid gap-1 bg-white ring-1 ring-slate-200 rounded-2xl p-1`}
             style={{ gridTemplateColumns: `repeat(${assignment.allowedTypes.length}, minmax(0, 1fr))` }}>
          {assignment.allowedTypes.map((t) => {
            const cfg = TYPE_CFG[t];
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`
                  h-11 rounded-xl text-[13px] font-extrabold transition
                  flex items-center justify-center gap-1.5
                  ${active
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-500 hover:text-slate-700'}
                `}
              >
                <span>{cfg.emoji}</span>
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col px-5 pt-5 pb-8 gap-4">
        {tab === 'text' && (
          <>
            <Field label="Your answer">
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                rows={10}
                placeholder="Type your answer…"
                className="
                  w-full rounded-2xl bg-white ring-1 ring-slate-200
                  focus:ring-2 focus:ring-indigo-500
                  px-4 py-3 text-[15px] font-medium text-slate-900
                  placeholder:text-slate-400 outline-none transition resize-none
                "
              />
              <div className="mt-1 text-right text-[11px] font-semibold text-slate-400 pr-1">
                {countWords(textValue)} word{countWords(textValue) === 1 ? '' : 's'}
              </div>
            </Field>
          </>
        )}

        {tab === 'image' && (
          <>
            <Field label="Photo">
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full rounded-2xl ring-1 ring-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (imagePreview) URL.revokeObjectURL(imagePreview);
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="absolute top-2 right-2 h-9 px-3 rounded-full bg-black/60 text-white text-[12px] font-extrabold backdrop-blur"
                  >
                    Retake
                  </button>
                </div>
              ) : (
                <label className="
                  w-full h-44 rounded-2xl bg-white ring-1 ring-dashed ring-slate-300
                  flex flex-col items-center justify-center gap-1 text-slate-500
                  hover:ring-indigo-400 hover:text-indigo-600 transition cursor-pointer
                ">
                  <div className="text-3xl">📷</div>
                  <div className="text-[13px] font-extrabold">Take or pick a photo</div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={onImagePick}
                    className="hidden"
                  />
                </label>
              )}
            </Field>
          </>
        )}

        {tab === 'audio' && (
          <>
            <Field label="Voice note">
              <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-5 flex flex-col items-center">
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                  {recording ? 'Recording' : audioBlob ? 'Ready' : 'Tap to start'}
                </div>
                <div className={`mt-1 text-[32px] font-black tabular-nums ${recording ? 'text-rose-600' : 'text-slate-900'}`}>
                  {fmtTime(elapsedMs)} <span className="text-[14px] font-bold text-slate-400">/ 3:00</span>
                </div>

                {!recording && !audioBlob && (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="
                      mt-4 w-20 h-20 rounded-full bg-rose-500 text-white
                      flex items-center justify-center
                      shadow-xl shadow-rose-500/30 active:scale-95 transition
                    "
                    aria-label="Start recording"
                  >
                    <span className="text-[34px] leading-none">🎤</span>
                  </button>
                )}

                {recording && (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="
                      mt-4 w-20 h-20 rounded-2xl bg-slate-900 text-white
                      flex items-center justify-center
                      shadow-xl active:scale-95 transition
                    "
                    aria-label="Stop recording"
                  >
                    <span className="w-6 h-6 bg-white rounded-sm" />
                  </button>
                )}

                {!recording && audioBlob && audioUrl && (
                  <>
                    <audio controls src={audioUrl} className="w-full mt-4" />
                    <button
                      type="button"
                      onClick={reRecord}
                      className="mt-3 h-10 px-4 rounded-xl bg-slate-100 text-slate-700 text-[12.5px] font-extrabold hover:bg-slate-200"
                    >
                      Re-record
                    </button>
                    {transcript && (
                      <div className="w-full mt-4">
                        <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-slate-500 mb-1">
                          Transcript
                        </div>
                        <p className="text-[13px] font-medium text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-xl p-3 ring-1 ring-slate-100">
                          {transcript.trim()}
                        </p>
                      </div>
                    )}
                    {!transcript && (
                      <p className="mt-3 text-[11.5px] font-semibold text-slate-400 text-center">
                        Transcription may not be available on this device — your audio is still saved.
                      </p>
                    )}
                  </>
                )}
              </div>
            </Field>
          </>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
            <p className="text-[13px] font-semibold text-rose-700">{error}</p>
          </div>
        )}

        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => setConfirmOpen(true)}
          className={`
            mt-auto w-full h-14 rounded-2xl text-base font-extrabold
            flex items-center justify-center gap-2 transition
            ${canConfirm
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
          `}
        >
          Submit
        </button>
      </div>

      {confirmOpen && (
        <ConfirmModal
          submitting={submitting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doSubmit}
        />
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

const TYPE_CFG = {
  text:  { label: 'Text',  emoji: '✍️' },
  image: { label: 'Image', emoji: '🖼️' },
  audio: { label: 'Audio', emoji: '🎤' },
};

function countWords(s) {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function fileExt(name, fallback) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return (m?.[1] || fallback).toLowerCase();
}

function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[13px] font-bold text-slate-700 mb-1.5 pl-1">{label}</div>
      {children}
    </div>
  );
}

function ConfirmModal({ submitting, onCancel, onConfirm }) {
  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-w-sm mx-auto animate-in slide-in-from-bottom">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-3xl">
            ⚠️
          </div>
        </div>
        <h3 className="mt-3 text-[19px] font-black text-slate-900 text-center">
          Submit for good?
        </h3>
        <p className="mt-1.5 text-[13.5px] font-semibold text-slate-500 text-center">
          You cannot resubmit once this is sent. Please review your answer first.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-12 rounded-2xl bg-slate-100 text-slate-700 text-[14px] font-extrabold hover:bg-slate-200"
          >
            Review
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={`
              h-12 rounded-2xl text-white text-[14px] font-extrabold
              flex items-center justify-center gap-2
              ${submitting ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'}
            `}
          >
            {submitting ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Submitting…
              </>
            ) : 'Yes, submit'}
          </button>
        </div>
      </div>
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
