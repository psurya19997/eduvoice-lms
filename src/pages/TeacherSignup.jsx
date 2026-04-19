import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import SchoolDropdown from '../components/SchoolDropdown.jsx';
import { supabase } from '../lib/supabase.js';
import { setDraft, getDraft } from '../lib/signupDraft.js';

/**
 * Teacher Signup — Step 1 of 3
 * Collects name + email + school, then sends OTP via Supabase Auth.
 *
 * Flow (PRD §3.1):
 *   1. This screen → enters details, taps "Send OTP"
 *   2. /signup/teacher/verify → enters 6-digit code from email
 *   3. /signup/teacher/password → sets password, profile row inserted
 */
export default function TeacherSignup() {
  const navigate = useNavigate();
  const draft = getDraft() ?? {};

  const [firstName, setFirstName] = useState(draft.firstName ?? '');
  const [lastName, setLastName] = useState(draft.lastName ?? '');
  const [email, setEmail] = useState(draft.email ?? '');
  const [schoolId, setSchoolId] = useState(draft.schoolId ?? '');
  const [schoolName, setSchoolName] = useState(draft.schoolName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    !!schoolId &&
    !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    // Persist draft BEFORE the network call so user doesn't lose progress
    // if something goes sideways.
    setDraft({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: cleanEmail,
      schoolId,
      schoolName,
    });

    // Supabase sends a 6-digit OTP when `emailRedirectTo` is omitted.
    // `shouldCreateUser: true` creates the auth user on first OTP verify.
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });

    setSubmitting(false);

    if (otpErr) {
      setError(otpErr.message || 'Could not send OTP. Try again.');
      return;
    }
    navigate('/signup/teacher/verify');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/signup" />
        <StepPill step={1} of={3} />
      </div>

      <div className="px-6 pt-3">
        <h1 className="text-[26px] leading-tight font-black text-slate-900">
          Let's get you started
        </h1>
        <p className="mt-1.5 text-[15px] font-medium text-slate-500">
          We'll send a 6-digit code to your email to verify it.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-5 pt-6 gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field id="firstName" label="First name">
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Aarav"
              autoComplete="given-name"
              className={inputClass}
            />
          </Field>
          <Field id="lastName" label="Last name">
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Sharma"
              autoComplete="family-name"
              className={inputClass}
            />
          </Field>
        </div>

        <Field id="email" label="Email address">
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            autoComplete="email"
            inputMode="email"
            className={inputClass}
          />
        </Field>

        <Field id="school" label="School">
          <SchoolDropdown
            id="school"
            value={schoolId}
            onChange={(id, name) => {
              setSchoolId(id);
              setSchoolName(name);
            }}
          />
        </Field>

        {error && (
          <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
            <p className="text-[13px] font-semibold text-rose-700">{error}</p>
          </div>
        )}

        <p className="mt-auto text-center text-[12px] font-medium text-slate-500 pb-3">
          By continuing, you agree to be a verified teacher in this school.
          Principals may need to approve your account.
        </p>

        <button
          type="submit"
          disabled={!canSubmit}
          className={`
            w-full h-14 rounded-2xl text-base font-extrabold
            flex items-center justify-center gap-2 transition mb-8
            ${canSubmit
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
          `}
        >
          {submitting ? (
            <Spinner />
          ) : (
            <>
              Send OTP
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M4 10h12m0 0l-4-4m4 4l-4 4"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </>
          )}
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

function Field({ id, label, children }) {
  return (
    <label htmlFor={id} className="block">
      <div className="text-[13px] font-bold text-slate-700 mb-1.5 pl-1">{label}</div>
      {children}
    </label>
  );
}

function StepPill({ step, of }) {
  return (
    <div className="ml-auto flex items-center gap-1.5 text-[12px] font-bold text-slate-500 bg-white ring-1 ring-slate-200 rounded-full px-3 py-1.5">
      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-extrabold">
        {step}
      </span>
      of {of}
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
