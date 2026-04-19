import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import TeacherBottomNav from '../components/TeacherBottomNav.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function TeacherProfile() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuthProfile('teacher');
  const [schools, setSchools] = useState([]);
  const [available, setAvailable] = useState([]);
  const [joinId, setJoinId] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!user) return;
    const { data: ts } = await supabase
      .from('teacher_schools')
      .select('id, is_approved, is_active, school:schools(id, name)')
      .eq('teacher_id', user.id);
    const rows = (ts ?? []).map((r) => ({ id: r.id, is_approved: r.is_approved, is_active: r.is_active, schoolId: r.school?.id, schoolName: r.school?.name ?? '—' }));
    setSchools(rows);
    const { data: all } = await supabase.from('schools').select('id, name').eq('is_active', true).order('name');
    const joinedIds = new Set(rows.map((r) => r.schoolId));
    setAvailable((all ?? []).filter((s) => !joinedIds.has(s.id)));
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [user]);

  const joinSchool = async () => {
    if (!joinId) return;
    setBusy(true); setMsg(null);
    const school = available.find((s) => s.id === joinId);
    const { data: sch } = await supabase.from('schools').select('require_teacher_approval').eq('id', joinId).maybeSingle();
    const autoApproved = sch?.require_teacher_approval === false;
    const { error } = await supabase.from('teacher_schools').insert({
      teacher_id: user.id, school_id: joinId, is_approved: autoApproved, is_active: true,
    });
    setBusy(false);
    if (error) { setMsg({ kind: 'error', text: error.message }); return; }
    setMsg({ kind: 'ok', text: `Joined ${school?.name ?? 'school'}${autoApproved ? '' : ' — pending approval'}.` });
    setJoinId(''); setShowJoin(false);
    refresh();
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

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="pt-6 px-5 pb-2"><BackButton to="/teacher" /></div>

      <div className="px-6 pt-1 flex flex-col items-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-[28px] font-black shadow-lg shadow-indigo-600/20">{initials}</div>
        <h1 className="mt-3 text-[22px] font-black text-slate-900">{profile.first_name} {profile.last_name}</h1>
        <p className="text-[12px] font-bold text-slate-500">{profile.email}</p>
      </div>

      {msg && (
        <div className={`mx-5 mt-4 rounded-xl px-4 py-3 ring-1 text-[13px] font-semibold
          ${msg.kind === 'ok' ? 'bg-emerald-50 ring-emerald-200 text-emerald-700' : 'bg-rose-50 ring-rose-200 text-rose-700'}`}>{msg.text}</div>
      )}

      <div className="px-5 pt-5 flex flex-col gap-3">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Schools</div>
            <button type="button" onClick={() => setShowJoin((v) => !v)} className="text-[12px] font-extrabold text-indigo-600">{showJoin ? 'Cancel' : '+ Join'}</button>
          </div>
          {schools.length === 0 ? (
            <p className="text-[12.5px] font-semibold text-slate-400">You're not in any school yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {schools.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="text-[14px] font-extrabold text-slate-900 truncate">{s.schoolName}</div>
                  <StatusBadge approved={s.is_approved} active={s.is_active} />
                </div>
              ))}
            </div>
          )}
          {showJoin && (
            <div className="mt-3 flex gap-2">
              <select value={joinId} onChange={(e) => setJoinId(e.target.value)}
                className="flex-1 h-11 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 text-[14px] font-semibold">
                <option value="">Select school</option>
                {available.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
              <button type="button" disabled={!joinId || busy} onClick={joinSchool} className="h-11 px-4 rounded-xl bg-indigo-600 text-white text-[12.5px] font-extrabold disabled:bg-slate-200 disabled:text-slate-400">Join</button>
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
      <TeacherBottomNav />
    </div>
  );
}

function StatusBadge({ approved, active }) {
  if (!active) return <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">DISABLED</span>;
  if (approved) return <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">APPROVED</span>;
  return <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">PENDING</span>;
}
