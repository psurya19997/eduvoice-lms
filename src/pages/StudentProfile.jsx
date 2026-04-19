import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import StudentBottomNav from '../components/StudentBottomNav.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function StudentProfile() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuthProfile('student');
  const [schoolName, setSchoolName] = useState('');
  const [pendingReq, setPendingReq] = useState(null);
  const [lastReq, setLastReq] = useState(null);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [requestedClass, setRequestedClass] = useState('');
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: s } = await supabase.from('schools').select('name').eq('id', profile.school_id).maybeSingle();
      setSchoolName(s?.name ?? '');
      const { data: reqs } = await supabase
        .from('class_change_requests')
        .select('id, status, requested_class, resolved_at, requested_at')
        .eq('student_id', user.id).order('requested_at', { ascending: false }).limit(1);
      const latest = reqs?.[0] ?? null;
      setLastReq(latest);
      setPendingReq(latest && latest.status === 'pending' ? latest : null);
    })();
  }, [profile, user]);

  const submitClassChange = async () => {
    if (!requestedClass || Number(requestedClass) === profile.class) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('class_change_requests').insert({
      student_id: user.id, school_id: profile.school_id,
      current_class: profile.class, requested_class: Number(requestedClass), status: 'pending',
    });
    setBusy(false);
    if (error) { setMsg({ kind: 'error', text: error.message }); return; }
    setShowClassPicker(false); setRequestedClass('');
    setMsg({ kind: 'ok', text: 'Class change request submitted.' });
    const { data } = await supabase.from('class_change_requests').select('id, status, requested_class, resolved_at, requested_at').eq('student_id', user.id).order('requested_at', { ascending: false }).limit(1);
    setLastReq(data?.[0] ?? null); setPendingReq(data?.[0] ?? null);
  };

  const changePassword = async () => {
    if (newPw.length < 6) { setMsg({ kind: 'error', text: 'Password must be at least 6 characters.' }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (error) setMsg({ kind: 'error', text: error.message });
    else { setNewPw(''); setShowPwForm(false); setMsg({ kind: 'ok', text: 'Password updated.' }); }
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate('/login', { replace: true }); };

  if (authLoading || !profile) return null;
  const initials = `${(profile.first_name ?? '?').slice(0,1)}${(profile.last_name ?? '').slice(0,1)}`.toUpperCase();
  const rejected = lastReq && lastReq.status === 'rejected';

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="pt-6 px-5 pb-2"><BackButton to="/student" /></div>

      <div className="px-6 pt-1 flex flex-col items-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-[28px] font-black shadow-lg shadow-indigo-600/20">{initials}</div>
        <h1 className="mt-3 text-[22px] font-black text-slate-900">{profile.first_name} {profile.last_name}</h1>
        <p className="text-[12px] font-bold text-indigo-600">Grade {profile.class}</p>
      </div>

      {msg && (
        <div className={`mx-5 mt-4 rounded-xl px-4 py-3 ring-1 text-[13px] font-semibold
          ${msg.kind === 'ok' ? 'bg-emerald-50 ring-emerald-200 text-emerald-700' : 'bg-rose-50 ring-rose-200 text-rose-700'}`}>{msg.text}</div>
      )}

      <div className="px-5 pt-5 flex flex-col gap-3">
        <Row label="First name" value={profile.first_name} />
        <Row label="Last name"  value={profile.last_name} />
        <Row label="Phone"      value={profile.phone} />
        <Row label="School"     value={schoolName || '—'} icon="🔒" />

        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Class</div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <div className="text-[15px] font-extrabold text-slate-900">Grade {profile.class}</div>
            {pendingReq ? (
              <span className="text-[10.5px] font-extrabold text-amber-700 bg-amber-100 rounded-full px-2.5 py-1">REQUEST PENDING (Grade {pendingReq.requested_class})</span>
            ) : (
              <button type="button" onClick={() => setShowClassPicker((v) => !v)} className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-[12px] font-extrabold active:scale-95">
                {rejected ? 'Re-request' : 'Change class'}
              </button>
            )}
          </div>
          {showClassPicker && !pendingReq && (
            <div className="mt-3 flex gap-2">
              <select value={requestedClass} onChange={(e) => setRequestedClass(e.target.value)}
                className="flex-1 h-11 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 text-[14px] font-semibold">
                <option value="">Select grade</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).filter((n) => n !== profile.class).map((n) => (<option key={n} value={n}>Grade {n}</option>))}
              </select>
              <button type="button" disabled={!requestedClass || busy} onClick={submitClassChange} className="h-11 px-4 rounded-xl bg-indigo-600 text-white text-[12.5px] font-extrabold disabled:bg-slate-200 disabled:text-slate-400">Submit</button>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-extrabold text-slate-900">Change password</div>
            <button type="button" onClick={() => setShowPwForm((v) => !v)} className="text-[12px] font-extrabold text-indigo-600">{showPwForm ? 'Cancel' : 'Edit'}</button>
          </div>
          {showPwForm && (
            <div className="mt-3 flex gap-2">
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password"
                className="flex-1 h-11 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 text-[14px] font-semibold" />
              <button type="button" disabled={busy} onClick={changePassword} className="h-11 px-4 rounded-xl bg-indigo-600 text-white text-[12.5px] font-extrabold">Save</button>
            </div>
          )}
        </div>

        <button type="button" onClick={signOut} className="mt-2 h-12 rounded-2xl bg-white ring-1 ring-rose-200 text-rose-600 text-[13.5px] font-extrabold hover:bg-rose-50">Log out</button>
      </div>

      <div className="h-6" />
      <StudentBottomNav />
    </div>
  );
}

function Row({ label, value, icon }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <div className="text-[15px] font-extrabold text-slate-900 truncate">{value || '—'}</div>
        {icon && <span className="text-slate-400 text-sm">{icon}</span>}
      </div>
    </div>
  );
}
