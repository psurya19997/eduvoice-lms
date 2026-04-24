import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { studentSyntheticEmail } from '../lib/studentEmail.js';

/**
 * Login — PRD §3.1 (teacher), §3.2 (student), §2.1/§2.2 (principal/super admin).
 *
 * Three tabs:
 * - Student   → phone-first smart lookup (phone → [pick name] → password)
 * - Teacher   → email + password
 * - Principal → email + password (same backend, different role gate)
 */
const TABS = [
  { id: 'student',   label: 'Student'   },
  { id: 'teacher',   label: 'Teacher'   },
  { id: 'principal', label: 'Principal' },
];

export default function Login() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('student');

  // Student multi-step state
  const [studentStep, setStudentStep] = useState(1); // 1 phone, 2 pick name, 3 password
  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState([]);       // profiles matched by phone
  const [chosen, setChosen] = useState(null);       // picked profile

  // Shared
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Forgot-password OTP flow (for Staff)
  const [forgotStep, setForgotStep] = useState('idle');
  const [otpCode, setOtpCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const resetForgot = () => {
    setForgotStep('idle'); setOtpCode(''); setNewPw(''); setConfirmPw(''); setError(null);
  };

  const forgotSendOtp = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError('Enter a valid email first.'); return; }
    setSubmitting(true); setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: false } });
    setSubmitting(false);
    if (e) return setError(e.message);
    setForgotStep('otp-sent');
  };

  const forgotVerifyOtp = async () => {
    if (otpCode.length !== 6) return;
    setSubmitting(true); setError(null);
    const { error: e } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: otpCode, type: 'email' });
    setSubmitting(false);
    if (e) return setError('Invalid or expired code.');
    setForgotStep('verified');
  };

  const forgotSavePw = async () => {
    if (newPw.length < 6) return setError('Password must be at least 6 characters.');
    if (newPw !== confirmPw) return setError('Passwords do not match.');
    setSubmitting(true); setError(null);
    const { error: e } = await supabase.auth.updateUser({ password: newPw });
    setSubmitting(false);
    if (e) return setError(e.message);
    setForgotStep('done');
    await supabase.auth.signOut();
    setTimeout(() => { resetForgot(); setPassword(''); }, 1800);
  };

  const switchTab = (id) => {
    setTab(id);
    setError(null);
    setPassword('');
    setShowPw(false);
    setStudentStep(1);
    setMatches([]);
    setChosen(null);
  };

  const backFromStudentStep = () => {
    setError(null);
    if (studentStep === 3) {
      setPassword('');
      setStudentStep(matches.length > 1 ? 2 : 1);
      if (matches.length <= 1) setChosen(null);
      return;
    }
    if (studentStep === 2) {
      setChosen(null);
      setStudentStep(1);
      return;
    }
  };

  const lookupPhone = async (e) => {
    e?.preventDefault?.();
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 7) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: pErr } = await supabase
        .from('profiles')
        .select('id, first_name, is_active')
        .eq('role', 'student')
        .eq('phone', phoneDigits)
	.eq('is_active', true);
      if (pErr) throw pErr;
      if (!data || data.length === 0) {
        throw new Error('No account found with this phone.');
      }
      setMatches(data);
      if (data.length === 1) {
        setChosen(data[0]);
        setStudentStep(3);
      } else {
        setStudentStep(2);
      }
    } catch (err) {
      setError(err.message || 'Could not look up this phone.');
    } finally {
      setSubmitting(false);
    }
  };

  const pickName = (profile) => {
    setChosen(profile);
    setError(null);
    setStudentStep(3);
  };

  const studentLogin = async (e) => {
    e.preventDefault();
    if (!chosen || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!chosen.is_active) {
        throw new Error('Your account has been disabled. Contact your principal');
      }
      const phoneDigits = phone.replace(/\D/g, '');
      const syntheticEmail = studentSyntheticEmail(phoneDigits, chosen.first_name);
      const { error: sErr } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password,
      });
      if (sErr) throw new Error('Invalid credentials. Please try again');
      navigate('/student', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not log in.');
    } finally {
      setSubmitting(false);
    }
  };

  const staffLogin = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data: signInData, error: sErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (sErr) throw new Error('Invalid credentials. Please try again');

      const uid = signInData.user?.id;
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', uid)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) throw new Error('No profile found for this account.');
      if (!profile.is_active) throw new Error('Your account has been disabled. Contact your principal');

      if (tab === 'teacher') {
        if (profile.role !== 'teacher') {
          await supabase.auth.signOut();
          throw new Error('This account is not a teacher. Try a different tab.');
        }
        const { data: ts } = await supabase
          .from('teacher_schools')
          .select('is_approved, is_active')
          .eq('teacher_id', uid);
        const hasApproved = (ts ?? []).some((r) => r.is_approved && r.is_active);
        if (!hasApproved) {
          await supabase.auth.signOut();
          navigate('/pending', { replace: true });
          return;
        }
        navigate('/teacher', { replace: true });
      } else {
        if (!['principal', 'super_admin'].includes(profile.role)) {
          await supabase.auth.signOut();
          throw new Error('This account is not a principal. Try a different tab.');
        }
        navigate(profile.role === 'super_admin' ? '/admin' : '/principal', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Could not log in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (tab === 'student' && studentStep > 1) {
      backFromStudentStep();
    } else {
      navigate('/');
    }
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneValid = phone.replace(/\D/g, '').length >= 7;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="px-6 pt-3">
        <h1 className="text-[26px] leading-tight font-black text-slate-900">
          {tab === 'student' && studentStep === 3 && chosen
            ? `Welcome, ${chosen.first_name}`
            : 'Welcome back'}
        </h1>
        <p className="mt-1.5 text-[15px] font-medium text-slate-500">
          {tab === 'student' && studentStep === 2
            ? 'We found more than one account. Who are you?'
            : tab === 'student' && studentStep === 3
            ? 'Enter your password to continue.'
            : 'Log in to continue to EduVoice.'}
        </p>
      </div>

      {(tab !== 'student' || studentStep === 1) && (
        <div className="px-5 pt-6">
          <div className="grid grid-cols-3 bg-white ring-1 ring-slate-200 rounded-2xl p-1 gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={`
                  h-11 rounded-xl text-[13px] font-extrabold transition
                  ${tab === t.id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700'}
                `}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STUDENT FLOW */}
      {tab === 'student' && studentStep === 1 && (
        <form onSubmit={lookupPhone} className="flex-1 flex flex-col px-5 pt-5 pb-8 gap-4">
          <Field id="phone" label="Phone number">
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              className={inputClass}
            />
          </Field>
          {error && <ErrorBox message={error} />}
          <SubmitButton disabled={!phoneValid || submitting} submitting={submitting}>
            Next
          </SubmitButton>

          {/* ADDED: Link at the start of login */}
          <div className="text-center mt-1">
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-[12.5px] font-extrabold text-indigo-600 hover:text-indigo-700"
            >
              Forgot password or phone?
            </button>
          </div>

          <SignupHint onClick={() => navigate('/signup')} />
        </form>
      )}

      {tab === 'student' && studentStep === 2 && (
        <div className="flex-1 flex flex-col px-5 pt-5 pb-8 gap-3">
          <div className="text-[12px] font-bold text-slate-500 pl-1">Select your name</div>
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pickName(m)}
              className="w-full text-left bg-white rounded-2xl ring-1 ring-slate-200 px-4 py-4 flex items-center gap-3 hover:ring-indigo-400 active:scale-[0.99] transition"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-[14px] font-extrabold shrink-0">
                {(m.first_name ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-extrabold text-slate-900 truncate">{m.first_name}</div>
                <div className="text-[11.5px] font-semibold text-slate-500">Tap to continue</div>
              </div>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-slate-300">
                <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
          {error && <ErrorBox message={error} />}
        </div>
      )}

      {tab === 'student' && studentStep === 3 && chosen && (
        <form onSubmit={studentLogin} className="flex-1 flex flex-col px-5 pt-5 pb-8 gap-4">
          <div className="bg-white ring-1 ring-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-[14px] font-extrabold shrink-0">
              {(chosen.first_name ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-extrabold text-slate-900 truncate">{chosen.first_name}</div>
              <div className="text-[11.5px] font-semibold text-slate-500">{phone.replace(/\D/g, '')}</div>
            </div>
            <button type="button" onClick={backFromStudentStep} className="text-[12px] font-bold text-indigo-600">Change</button>
          </div>

          <Field id="pw" label="Password">
            <div className="relative">
              <input
                id="pw"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className={`${inputClass} pr-14`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-slate-500"
              >
                {showPw ? EyeOffIcon : EyeIcon}
              </button>
            </div>
          </Field>

          {error && <ErrorBox message={error} />}

          <SubmitButton disabled={!password || submitting} submitting={submitting}>
            Log in
          </SubmitButton>

          <div className="text-center mt-2">
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-[12.5px] font-extrabold text-indigo-600 hover:text-indigo-700"
            >
              Forgot password?
            </button>
          </div>
        </form>
      )}

      {/* STAFF FLOW */}
      {tab !== 'student' && (
        <form onSubmit={staffLogin} className="flex-1 flex flex-col px-5 pt-5 pb-8 gap-4">
          <Field id="email" label="Email address">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tab === 'teacher' ? 'you@school.edu' : 'principal@school.edu'}
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
                placeholder="Your password"
                className={`${inputClass} pr-14`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-slate-500"
              >
                {showPw ? EyeOffIcon : EyeIcon}
              </button>
            </div>
          </Field>

          {error && <ErrorBox message={error} />}

          <SubmitButton disabled={!emailValid || !password || submitting} submitting={submitting}>
            Log in
          </SubmitButton>

          {forgotStep === 'idle' && (
            <button type="button" onClick={() => { setForgotStep('start'); setError(null); }}
              className="text-center text-[12.5px] font-extrabold text-indigo-600">
              Forgot password?
            </button>
          )}
          {forgotStep === 'start' && (
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 flex flex-col gap-2">
              <p className="text-[12px] font-semibold text-slate-600 px-1">We'll send a code to the email above.</p>
              <div className="flex gap-2">
                <button type="button" onClick={forgotSendOtp} disabled={submitting} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white text-[12.5px] font-extrabold">Send OTP</button>
                <button type="button" onClick={resetForgot} className="h-11 px-3 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-[12.5px] font-extrabold">Back</button>
              </div>
            </div>
          )}
          {forgotStep === 'otp-sent' && (
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 flex flex-col gap-2">
              <p className="text-[12px] font-semibold text-slate-600 px-1">Enter code sent to {email}.</p>
              <input value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" placeholder="••••••" maxLength={6}
                className="w-full h-12 rounded-xl bg-white ring-1 ring-slate-200 px-4 text-center tracking-[0.6em] text-[18px] font-black" />
              <div className="flex gap-2">
                <button type="button" onClick={forgotVerifyOtp} disabled={submitting || otpCode.length !== 6} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white text-[12.5px] font-extrabold">Verify</button>
                <button type="button" onClick={resetForgot} className="h-11 px-3 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-[12.5px] font-extrabold">Back</button>
              </div>
            </div>
          )}
          {forgotStep === 'verified' && (
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 flex flex-col gap-2">
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password"
                className="w-full h-11 rounded-xl bg-white ring-1 ring-slate-200 px-3 text-[14px] font-semibold outline-none" />
              <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirm password"
                className="w-full h-11 rounded-xl bg-white ring-1 ring-slate-200 px-3 text-[14px] font-semibold outline-none" />
              <div className="flex gap-2">
                <button type="button" onClick={forgotSavePw} disabled={submitting} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white text-[12.5px] font-extrabold">Save password</button>
                <button type="button" onClick={resetForgot} className="h-11 px-3 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-[12.5px] font-extrabold">Back</button>
              </div>
            </div>
          )}
          {forgotStep === 'done' && (
            <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-center">
              <p className="text-[13px] font-semibold text-emerald-700">Password updated!</p>
            </div>
          )}

          <SignupHint onClick={() => navigate('/signup')} />
        </form>
      )}
    </div>
  );
}

/* ---------- PIECES ---------- */

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

function SubmitButton({ disabled, submitting, children }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={`
        mt-2 w-full h-14 rounded-2xl text-base font-extrabold
        flex items-center justify-center gap-2 transition
        ${!disabled
          ? 'bg-indigo-600 text-white shadow-lg active:scale-[0.98]'
          : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
      `}
    >
      {submitting ? (
        <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : children}
    </button>
  );
}

function ErrorBox({ message }) {
  return (
    <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
      <p className="text-[13px] font-semibold text-rose-700">{message}</p>
    </div>
  );
}

function SignupHint({ onClick }) {
  return (
    <p className="text-center text-[13px] font-semibold text-slate-500 pt-2">
      New to EduVoice?{' '}
      <button
        type="button"
        onClick={onClick}
        className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
      >
        Create an account
      </button>
    </p>
  );
}

const EyeIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M2.5 10C4 6.5 6.8 4.5 10 4.5s6 2 7.5 5.5c-1.5 3.5-4.3 5.5-7.5 5.5s-6-2-7.5-5.5z" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

const EyeOffIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 3l14 14M8 4.9A8.3 8.3 0 0 1 10 4.5c3.2 0 6 2 7.5 5.5a10 10 0 0 1-2 2.7M6.2 6.2A10 10 0 0 0 2.5 10c1.5 3.5 4.3 5.5 7.5 5.5 1 0 2-.2 2.9-.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M8.5 8.5a2.5 2.5 0 0 0 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);