import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';
import { getDraft } from '../lib/signupDraft.js';

const CODE_LEN = 6;
const RESEND_SECONDS = 30;

/**
 * Teacher Signup — Step 2 of 3 — OTP verification
 *
 * Shows 6 single-digit boxes with auto-advance. On a full 6-digit code,
 * auto-submits via supabase.auth.verifyOtp({ type: 'email' }).
 *
 * On success → /signup/teacher/password (step 3) with the authenticated
 * session already set by Supabase (verifyOtp returns a session).
 */
export default function TeacherVerify() {
  const navigate = useNavigate();
  const draft = getDraft();

  // Bounce back to step 1 if the user lands here without a draft (refresh,
  // deep link, etc.) — we need their email to verify.
  useEffect(() => {
    if (!draft?.email) navigate('/signup/teacher', { replace: true });
  }, [draft, navigate]);

  const [digits, setDigits] = useState(Array(CODE_LEN).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [justResent, setJustResent] = useState(false);
  const inputsRef = useRef([]);

  // Resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // Focus first box on mount
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const fullCode = digits.join('');

  const updateDigit = (i, value) => {
    // Only accept a single digit
    const v = (value.match(/\d/) || [''])[0];
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (v && i < CODE_LEN - 1) inputsRef.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < CODE_LEN - 1) inputsRef.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, CODE_LEN);
    if (!pasted) return;
    e.preventDefault();
    const chars = pasted.padEnd(CODE_LEN, '').slice(0, CODE_LEN).split('');
    setDigits(chars.map((c) => c || ''));
    const nextIdx = Math.min(pasted.length, CODE_LEN - 1);
    inputsRef.current[nextIdx]?.focus();
  };

  // Auto-submit as soon as 6 digits are present
  useEffect(() => {
    if (fullCode.length === CODE_LEN && !submitting) {
      void handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullCode]);

  const handleVerify = async () => {
    if (!draft?.email || fullCode.length !== CODE_LEN) return;
    setSubmitting(true);
    setError(null);

    const { error: vErr } = await supabase.auth.verifyOtp({
      email: draft.email,
      token: fullCode,
      type: 'email',
    });

    setSubmitting(false);

    if (vErr) {
      setError(vErr.message || 'Invalid or expired code.');
      // Clear boxes and refocus so the user can retype
      setDigits(Array(CODE_LEN).fill(''));
      inputsRef.current[0]?.focus();
      return;
    }
    navigate('/signup/teacher/password');
  };

  const handleResend = async () => {
    if (resendIn > 0 || resending || !draft?.email) return;
    setResending(true);
    setError(null);
    const { error: rErr } = await supabase.auth.signInWithOtp({
      email: draft.email,
      options: { shouldCreateUser: true },
    });
    setResending(false);
    if (rErr) {
      setError(rErr.message || 'Could not resend code.');
      return;
    }
    setResendIn(RESEND_SECONDS);
    setJustResent(true);
    setTimeout(() => setJustResent(false), 2500);
  };

  if (!draft?.email) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/signup/teacher" />
        <div className="ml-auto flex items-center gap-1.5 text-[12px] font-bold text-slate-500 bg-white ring-1 ring-slate-200 rounded-full px-3 py-1.5">
          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-extrabold">
            2
          </span>
          of 3
        </div>
      </div>

      <div className="px-6 pt-3">
        <h1 className="text-[26px] leading-tight font-black text-slate-900">
          Check your inbox
        </h1>
        <p className="mt-1.5 text-[15px] font-medium text-slate-500">
          We sent a 6-digit code to{' '}
          <span className="font-bold text-slate-800 break-all">{draft.email}</span>
          .
        </p>
      </div>

      {/* OTP inputs */}
      <div className="px-5 pt-8">
        <div
          className="grid grid-cols-6 gap-2"
          onPaste={handlePaste}
        >
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputsRef.current[i] = el)}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={d}
              onChange={(e) => updateDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={submitting}
              className={`
                h-14 w-full rounded-2xl bg-white
                text-center text-2xl font-extrabold text-slate-900
                outline-none transition
                disabled:opacity-60
                focus:ring-2 focus:ring-indigo-500
                ${d ? 'ring-2 ring-indigo-500' : 'ring-1 ring-slate-200'}
              `}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
            <p className="text-[13px] font-semibold text-rose-700">{error}</p>
          </div>
        )}
        {justResent && (
          <div className="mt-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3">
            <p className="text-[13px] font-semibold text-emerald-700">
              New code sent. Check your inbox.
            </p>
          </div>
        )}
      </div>

      {/* Resend + footer */}
      <div className="mt-auto px-6 pb-8 pt-6 text-center">
        <p className="text-[13px] font-semibold text-slate-500">
          Didn't get the code?{' '}
          {resendIn > 0 ? (
            <span className="text-slate-400">Resend in {resendIn}s</span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-indigo-600 hover:text-indigo-700 font-bold underline underline-offset-2 disabled:opacity-60"
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
        </p>

        <button
          type="button"
          onClick={() => navigate('/signup/teacher')}
          className="mt-3 text-[13px] font-semibold text-slate-500 hover:text-slate-700"
        >
          Wrong email? <span className="underline underline-offset-2">Change it</span>
        </button>

        {submitting && (
          <div className="mt-5 flex items-center justify-center gap-2 text-indigo-600">
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="text-[13px] font-bold">Verifying…</span>
          </div>
        )}
      </div>
    </div>
  );
}
