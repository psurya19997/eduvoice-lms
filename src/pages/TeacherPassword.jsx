import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { getDraft, clearDraft } from '../lib/signupDraft.js';

/**
 * Teacher Signup — Step 3 of 3 — Set password + create profile
 *
 * By this point, supabase.auth.verifyOtp has already created an
 * authenticated session for the user. We just need to:
 *   1. Set their password via supabase.auth.updateUser({ password })
 *   2. Insert a row into `profiles` (role=teacher, email, names)
 *   3. Insert a row into `teacher_schools` (pending approval per school
 *      default) — per PRD §2.3, approval is per school, default ON.
 *   4. Route to /pending (if school requires approval) or /login — for
 *      simplicity we always send to /pending and it can detect approval
 *      state. We'll refine routing when we wire the session context.
 */
export default function TeacherPassword() {
  const navigate = useNavigate();
  const draft = getDraft();

  const [authUserId, setAuthUserId] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Guard: must be signed-in (from verifyOtp) AND have the draft.
  useEffect(() => {
    (async () => {
      // Dev-only bypass for previewing the UI without a real session.
      // Safe to leave in: ?preview=1 is never produced by our flow.
      const isPreview =
        import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1';
      if (isPreview) {
        setAuthUserId('preview-user');
        return;
      }
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (!uid || !draft?.email) {
        navigate('/signup/teacher', { replace: true });
        return;
      }
      setAuthUserId(uid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strength = useMemo(() => scorePassword(password), [password]);

  const match = confirm.length > 0 && password === confirm;
  const canSubmit =
    password.length >= 8 && strength.score >= 2 && match && !submitting && !!authUserId;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    // 1) Set the password on the existing session
    const { error: pwErr } = await supabase.auth.updateUser({ password });
    if (pwErr) {
      setSubmitting(false);
      setError(pwErr.message || 'Could not set password.');
      return;
    }

    // 2) Insert profile row (role=teacher).
    //    We UPSERT on id in case a partial row already exists.
    const { error: profileErr } = await supabase.from('profiles').upsert(
      {
        id: authUserId,
        first_name: draft.firstName,
        last_name: draft.lastName,
        email: draft.email,
        role: 'teacher',
        phone: null,
        school_id: null,
        class: null,
      },
      { onConflict: 'id' }
    );
    if (profileErr) {
      setSubmitting(false);
      setError(
        `Account created but we couldn't save your profile: ${profileErr.message}. Please contact support.`
      );
      return;
    }

    // 3) Check the school's approval toggle. If approval is OFF, the
    //    teacher gets instant access; otherwise they land on /pending.
    let requiresApproval = true;
    if (draft.schoolId) {
      const { data: school, error: schoolErr } = await supabase
        .from('schools')
        .select('require_teacher_approval')
        .eq('id', draft.schoolId)
        .maybeSingle();
      if (schoolErr) {
        setSubmitting(false);
        setError(`Couldn't load school settings: ${schoolErr.message}`);
        return;
      }
      requiresApproval = school?.require_teacher_approval ?? true;

      // 4) Link teacher to the selected school, pre-approved when the
      //    school's toggle is OFF.
      const { error: tsErr } = await supabase.from('teacher_schools').insert({
        teacher_id: authUserId,
        school_id: draft.schoolId,
        is_approved: !requiresApproval,
        is_active: true,
      });
      if (tsErr && !/duplicate key|unique/i.test(tsErr.message)) {
        setSubmitting(false);
        setError(`Couldn't request school access: ${tsErr.message}`);
        return;
      }
    }

    setSubmitting(false);
    clearDraft();

    if (requiresApproval) {
      // Sign out so the teacher has to log in once a principal approves.
      await supabase.auth.signOut();
      navigate('/pending', { replace: true });
    } else {
      // Instant access — keep the live session and go straight to dashboard.
      navigate('/teacher', { replace: true });
    }
  };

  if (!draft?.email || !authUserId) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/signup/teacher/verify" />
        <div className="ml-auto flex items-center gap-1.5 text-[12px] font-bold text-slate-500 bg-white ring-1 ring-slate-200 rounded-full px-3 py-1.5">
          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-extrabold">
            3
          </span>
          of 3
        </div>
      </div>

      <div className="px-6 pt-3">
        <h1 className="text-[26px] leading-tight font-black text-slate-900">
          Create a password
        </h1>
        <p className="mt-1.5 text-[15px] font-medium text-slate-500">
          You'll use <span className="font-bold text-slate-800">{draft.email}</span>{' '}
          and this password to log in.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-5 pt-6 gap-4">
        {/* Password */}
        <div>
          <label htmlFor="pw" className="text-[13px] font-bold text-slate-700 mb-1.5 pl-1 block">
            Password
          </label>
          <div className="relative">
            <input
              id="pw"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              className={`
                w-full h-14 rounded-2xl bg-white pr-14
                ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500
                px-4 text-[15px] font-semibold text-slate-900 placeholder:text-slate-400
                outline-none transition
              `}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            >
              {showPw ? EyeOffIcon : EyeIcon}
            </button>
          </div>

          <StrengthBar strength={strength} show={password.length > 0} />
        </div>

        {/* Confirm */}
        <div>
          <label
            htmlFor="pw2"
            className="text-[13px] font-bold text-slate-700 mb-1.5 pl-1 block"
          >
            Confirm password
          </label>
          <input
            id="pw2"
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type it again"
            autoComplete="new-password"
            className={`
              w-full h-14 rounded-2xl bg-white
              ring-1 focus:ring-2
              px-4 text-[15px] font-semibold text-slate-900 placeholder:text-slate-400
              outline-none transition
              ${confirm.length === 0
                ? 'ring-slate-200 focus:ring-indigo-500'
                : match
                ? 'ring-emerald-400 focus:ring-emerald-500'
                : 'ring-rose-300 focus:ring-rose-500'}
            `}
          />
          {confirm.length > 0 && !match && (
            <p className="mt-1.5 text-[12px] font-semibold text-rose-600 pl-1">
              Passwords don't match yet.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
            <p className="text-[13px] font-semibold text-rose-700">{error}</p>
          </div>
        )}

        {/* Requirements checklist */}
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-4">
          <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            Password should have
          </p>
          <ul className="flex flex-col gap-1.5 text-[13px] font-semibold">
            <Req ok={password.length >= 8} label="At least 8 characters" />
            <Req ok={/[A-Z]/.test(password)} label="An uppercase letter" />
            <Req ok={/\d/.test(password)} label="A number" />
            <Req ok={/[^A-Za-z0-9]/.test(password)} label="A symbol (optional, adds strength)" optional />
          </ul>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={`
            mt-auto w-full h-14 rounded-2xl text-base font-extrabold
            flex items-center justify-center gap-2 transition mb-8
            ${canSubmit
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
          `}
        >
          {submitting ? <Spinner /> : 'Create my account'}
        </button>
      </form>
    </div>
  );
}

/* ---------- helpers ---------- */

function scorePassword(pw) {
  if (!pw) return { score: 0, label: '', color: 'bg-slate-200' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  // 0..5 → 0..4 scale
  const score = Math.min(4, Math.max(0, s - 1));
  const meta = [
    { label: 'Too weak', color: 'bg-rose-500', text: 'text-rose-600' },
    { label: 'Weak',     color: 'bg-orange-500', text: 'text-orange-600' },
    { label: 'Okay',     color: 'bg-amber-500',  text: 'text-amber-600' },
    { label: 'Strong',   color: 'bg-lime-500',   text: 'text-lime-600' },
    { label: 'Excellent', color: 'bg-emerald-500', text: 'text-emerald-600' },
  ][score];
  return { score, ...meta };
}

function StrengthBar({ strength, show }) {
  if (!show) return null;
  return (
    <div className="mt-2 pl-1">
      <div className="flex gap-1 h-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`
              flex-1 rounded-full transition-colors
              ${i < strength.score ? strength.color : 'bg-slate-200'}
            `}
          />
        ))}
      </div>
      <p className={`mt-1.5 text-[12px] font-bold ${strength.text}`}>
        {strength.label}
      </p>
    </div>
  );
}

function Req({ ok, label, optional = false }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`
          w-5 h-5 rounded-full flex items-center justify-center shrink-0
          ${ok ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'}
        `}
      >
        {ok ? (
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 10.5l3.5 3.5 7-7"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
        )}
      </span>
      <span className={ok ? 'text-slate-700' : 'text-slate-500'}>
        {label}
        {optional && <span className="text-slate-400"> · optional</span>}
      </span>
    </li>
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

const EyeIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M2.5 10C4 6.5 6.8 4.5 10 4.5s6 2 7.5 5.5c-1.5 3.5-4.3 5.5-7.5 5.5s-6-2-7.5-5.5z"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
const EyeOffIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M3 3l14 14M8 4.9A8.3 8.3 0 0 1 10 4.5c3.2 0 6 2 7.5 5.5a10 10 0 0 1-2 2.7M6.2 6.2A10 10 0 0 0 2.5 10c1.5 3.5 4.3 5.5 7.5 5.5 1 0 2-.2 2.9-.6"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <path d="M8.5 8.5a2.5 2.5 0 0 0 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
