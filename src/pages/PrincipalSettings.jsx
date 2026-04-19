import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import PrincipalBottomNav from '../components/PrincipalBottomNav.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function PrincipalSettings() {
  const navigate = useNavigate();
  const { loading: authLoading } = useAuthProfile('principal');
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [school, setSchool] = useState(null);
  const [counts, setCounts] = useState({ teachers: 0, students: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('schools').select('id, name').eq('is_active', true).order('name');
      setSchools(data ?? []); if ((data ?? []).length > 0) setSchoolId(data[0].id);
    })();
  }, []);

  const load = async (sid) => {
    if (!sid) return;
    const [sRes, tRes, stRes] = await Promise.all([
      supabase.from('schools').select('id, name, require_teacher_approval, is_active').eq('id', sid).maybeSingle(),
      supabase.from('teacher_schools').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('is_approved', true).eq('is_active', true),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('school_id', sid).eq('is_active', true),
    ]);
    setSchool(sRes.data ?? null);
    setCounts({ teachers: tRes.count ?? 0, students: stRes.count ?? 0 });
  };
  useEffect(() => { load(schoolId); }, [schoolId]);

  const toggleApproval = async () => {
    if (!school) return;
    setBusy(true); setMsg(null);
    const next = !school.require_teacher_approval;
    const { error } = await supabase.from('schools').update({ require_teacher_approval: next }).eq('id', school.id);
    setBusy(false);
    if (error) setMsg({ kind: 'error', text: error.message });
    else { setSchool({ ...school, require_teacher_approval: next }); setMsg({ kind: 'ok', text: next ? 'Approval now required.' : 'Teachers get instant access.' }); }
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate('/login', { replace: true }); };

  if (authLoading) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="pt-6 px-5 pb-2"><BackButton to="/principal" /></div>
      <div className="px-6 pt-1"><h1 className="text-[22px] font-black text-slate-900">Settings</h1></div>

      {schools.length > 1 && (
        <div className="px-5 pt-3 overflow-x-auto">
          <div className="flex gap-2 whitespace-nowrap">
            {schools.map((s) => (
              <button key={s.id} type="button" onClick={() => setSchoolId(s.id)} className={`h-9 px-3 rounded-full text-[12.5px] font-extrabold ring-1
                ${s.id === schoolId ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200'}`}>{s.name}</button>
            ))}
          </div>
        </div>
      )}

      {msg && (
        <div className={`mx-5 mt-4 rounded-xl px-4 py-3 ring-1 text-[13px] font-semibold
          ${msg.kind === 'ok' ? 'bg-emerald-50 ring-emerald-200 text-emerald-700' : 'bg-rose-50 ring-rose-200 text-rose-700'}`}>{msg.text}</div>
      )}

      <div className="px-5 pt-4 flex flex-col gap-3">
        {school && (
          <>
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">School</div>
              <div className="mt-0.5 text-[16px] font-black text-slate-900">{school.name}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-3">
                  <div className="text-[11px] font-bold text-slate-500">Teachers</div>
                  <div className="text-[20px] font-black text-slate-900">{counts.teachers}</div>
                </div>
                <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-3">
                  <div className="text-[11px] font-bold text-slate-500">Students</div>
                  <div className="text-[20px] font-black text-slate-900">{counts.students}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 pr-3">
                <div className="text-[14px] font-extrabold text-slate-900">Require teacher approval</div>
                <div className="text-[11.5px] font-semibold text-slate-500">Toggle off to let teachers join instantly.</div>
              </div>
              <button type="button" role="switch" aria-checked={school.require_teacher_approval} disabled={busy}
                onClick={toggleApproval}
                className={`shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition
                  ${school.require_teacher_approval ? 'bg-indigo-600' : 'bg-slate-300'} ${busy ? 'opacity-60' : 'active:scale-95'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition
                  ${school.require_teacher_approval ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </>
        )}

        <button type="button" onClick={signOut} className="mt-2 h-12 rounded-2xl bg-white ring-1 ring-rose-200 text-rose-600 text-[13.5px] font-extrabold hover:bg-rose-50">Log out</button>
      </div>

      <div className="h-6" />
      <PrincipalBottomNav />
    </div>
  );
}
