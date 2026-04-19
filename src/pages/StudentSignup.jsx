import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import SchoolDropdown from '../components/SchoolDropdown.jsx';
import { supabase } from '../lib/supabase.js';
import { studentSyntheticEmail } from '../lib/studentEmail.js';

/**
 * Student Signup (PRD §2.4, §3.2)
 *
 * Single screen — no OTP. Uniqueness: phone + first_name + school_id.
 * Auth: creates a Supabase Auth user with a synthetic email of
 * `phone+{digits}@students.eduvoice.local` so we can reuse
 * supabase.auth for password-based login. The phone itself is stored
 * on the profiles row and is what the student types at login.
 */
export default function StudentSignup() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [klass, setKlass] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const phoneDigits = phone.replace(/\D/g, '');
  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 1 &&
    phoneDigits.length >= 7 &&
    password.length >= 6 &&
    !!schoolId &&
    !!klass &&
    !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const fn = firstName.trim();
    const ln = lastName.trim();

    // PRD §3.2: check (phone, first_name, school_id) uniqueness first.
    const { data: existing, error: dupErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .eq('phone', phoneDigits)
      .eq('first_name', fn)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (dupErr) {
      setSubmitting(false);
      setError(dupErr.message);
      return;
    }
    if (existing) {
      setSubmitting(false);
      setError('An account with this name and phone already exists for this school.');
      return;
    }

    // Synthetic email so supabase.auth can hold a password-based credential
    // for this student. Deterministic per (phone, first_name) so login can
    // reconstruct it from just the phone + chosen sibling name.
    const syntheticEmail = studentSyntheticEmail(phoneDigits, fn);

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: syntheticEmail,
      password,
    });
    if (signUpErr) {
      console.error('[StudentSignup] auth.signUp failed:', signUpErr);
      setSubmitting(false);
      setError(signUpErr.message);
      return;
    }
    const uid = signUpData.user?.id;
    if (!uid) {
      setSubmitting(false);
      setError('Could not create account. Please try again.');
      return;
    }

    // Profile row. `email` MUST be null for students — the CHECK constraint
    // `profiles_student_fields_ck` forbids email on role='student' rows.
    // The synthetic email lives in auth.users only and is reconstructed at
    // login time from phone + first_name.
    const profileRow = {
      id: uid,
      first_name: fn,
      last_name: ln,
      phone: phoneDigits,
      email: null,
      role: 'student',
      school_id: schoolId,
      class: Number(klass),
      is_active: true,
    };
    const { error: profileErr } = await supabase.from('profiles').insert(profileRow);
    if (profileErr) {
      console.error('[StudentSignup] profiles.insert failed:', profileErr, 'row:', profileRow);
      // Best-effort rollback: sign out so the orphaned auth.users row is at
      // least not active in this browser. Full delete requires service_role
      // and must be handled server-side.
      await supabase.auth.signOut().catch(() => {});
      setSubmitting(false);
      setError(
        `Could not create profile: ${profileErr.message}` +
        (profileErr.details ? ` (${profileErr.details})` : ''),
      );
      return;
    }

    setSubmitting(false);
    navigate('/student', { replace: true });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/signup" />
      </div>

      <div className="px-6 pt-3">
        <h1 className="text-[26px] leading-tight font-black text-slate-900">
          Create your account
        </h1>
        <p className="mt-1.5 text-[15px] font-medium text-slate-500">
          Instant access — just pick your school and class.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-5 pt-6 pb-8 gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field id="firstName" label="First name">
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Priya"
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
              placeholder="Patel"
              autoComplete="family-name"
              className={inputClass}
            />
          </Field>
        </div>

        <Field id="phone" label="Phone number">
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
            autoComplete="tel"
            inputMode="tel"
            className={inputClass}
          />
        </Field>

        <Field id="pw" label="Password">
          <div className="relative">
            <input
              id="pw"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              className={`${inputClass} pr-14`}
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
          <p className="mt-1.5 text-[12px] font-semibold text-slate-500 pl-1">
            Your school is fixed once you sign up.
          </p>
        </Field>

        <Field id="class" label="Class">
          <div className="relative">
            <select
              id="class"
              value={klass}
              onChange={(e) => setKlass(e.target.value)}
              className={`
                w-full h-14 rounded-2xl bg-white
                ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500
                px-4 pr-11 text-[15px] font-semibold appearance-none outline-none transition
                ${klass ? 'text-slate-900' : 'text-slate-400'}
              `}
            >
              <option value="" disabled>Select your class</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>Grade {n}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
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
            mt-2 w-full h-14 rounded-2xl text-base font-extrabold
            flex items-center justify-center gap-2 transition
            ${canSubmit
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
          `}
        >
          {submitting ? <Spinner /> : 'Create my account'}
        </button>

        <p className="text-center text-[13px] font-semibold text-slate-500 pt-2">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
          >
            Log in
          </button>
        </p>
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
    <path d="M2.5 10C4 6.5 6.8 4.5 10 4.5s6 2 7.5 5.5c-1.5 3.5-4.3 5.5-7.5 5.5s-6-2-7.5-5.5z" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
const EyeOffIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M3 3l14 14M8 4.9A8.3 8.3 0 0 1 10 4.5c3.2 0 6 2 7.5 5.5a10 10 0 0 1-2 2.7M6.2 6.2A10 10 0 0 0 2.5 10c1.5 3.5 4.3 5.5 7.5 5.5 1 0 2-.2 2.9-.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M8.5 8.5a2.5 2.5 0 0 0 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
