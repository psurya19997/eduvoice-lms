import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import { supabase } from '../lib/supabase.js';

export default function StudentForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); 
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [studentId, setStudentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleVerifyIdentity = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const phoneDigits = phone.replace(/\D/g, '');
    
    // 1. Check if the student exists
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phoneDigits)
      .ilike('first_name', firstName.trim())
      .eq('role', 'student')
      .maybeSingle();

    if (pErr || !profile) {
      setError("Details don't match our records.");
      setLoading(false);
      return;
    }

    // 2. Identity confirmed, save ID and move to password step
    setStudentId(profile.id);
    setStep(2);
    setLoading(false);
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError(null);

    // 3. Call our new SQL function to reset the password
    const { error: rpcErr } = await supabase.rpc('admin_reset_password', {
      target_user_id: studentId,
      new_password: newPassword
    });

    if (rpcErr) {
      setError("System error. Please try again later.");
      console.error(rpcErr);
    } else {
      alert("Success! Your password has been changed.");
      navigate('/login');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <BackButton />
      <h1 className="text-2xl font-black text-slate-900 mt-6">Reset Password</h1>
      
      <form onSubmit={step === 1 ? handleVerifyIdentity : handlePasswordUpdate} className="mt-8 space-y-4">
        {step === 1 ? (
          <>
            <p className="text-slate-500 font-bold text-sm">Verify your phone and name.</p>
            <input 
              type="tel" placeholder="Phone Number" required
              className="w-full h-14 rounded-2xl bg-white ring-1 ring-slate-200 px-4 font-bold outline-none"
              value={phone} onChange={(e) => setPhone(e.target.value)}
            />
            <input 
              type="text" placeholder="First Name" required
              className="w-full h-14 rounded-2xl bg-white ring-1 ring-slate-200 px-4 font-bold outline-none"
              value={firstName} onChange={(e) => setFirstName(e.target.value)}
            />
          </>
        ) : (
          <>
            <p className="text-indigo-600 font-bold text-sm">Set your new password.</p>
            <input 
              type="password" placeholder="New Password" required
              className="w-full h-14 rounded-2xl bg-white ring-1 ring-slate-200 px-4 font-bold outline-none"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
            />
          </>
        )}

        <button disabled={loading} className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black shadow-lg active:scale-95 transition-all">
          {loading ? 'Working...' : step === 1 ? 'Verify Me' : 'Save Password'}
        </button>
        
        {error && <p className="text-rose-600 font-bold text-sm text-center bg-rose-50 p-3 rounded-xl">{error}</p>}
      </form>
    </div>
  );
}