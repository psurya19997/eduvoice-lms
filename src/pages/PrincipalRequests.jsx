import { useEffect, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import PrincipalBottomNav from '../components/PrincipalBottomNav.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function PrincipalRequests() {
  const { loading: authLoading } = useAuthProfile('principal');
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('schools').select('id, name').eq('is_active', true).order('name');
      setSchools(data ?? []); if ((data ?? []).length > 0) setSchoolId(data[0].id);
    })();
  }, []);

  const load = async (sid) => {
    if (!sid) return;
    const { data } = await supabase.from('class_change_requests').select(`
      id, current_class, requested_class, requested_at, student_id,
      student:profiles!class_change_requests_student_id_fkey(first_name, last_name, class)
    `).eq('school_id', sid).eq('status', 'pending').order('requested_at', { ascending: true });
    setRows((data ?? []).map((r) => ({
      id: r.id, student_id: r.student_id,
      name: r.student ? `${r.student.first_name ?? ''} ${r.student.last_name ?? ''}`.trim() : 'Student',
      currentClass: r.current_class, requestedClass: r.requested_class,
      requestedAt: r.requested_at,
    })));
  };
  useEffect(() => { load(schoolId); }, [schoolId]);

  const approveOne = async (req) => {
    setBusy(req.id);
    await supabase.from('class_change_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', req.id);
    await supabase.from('profiles').update({ class: req.requestedClass }).eq('id', req.student_id);
    setBusy(null); load(schoolId);
  };
  const rejectOne = async (req) => {
    setBusy(req.id);
    await supabase.from('class_change_requests').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', req.id);
    setBusy(null); load(schoolId);
  };
  const approveAll = async () => {
    setBusy('all');
    for (const r of rows) {
      await supabase.from('class_change_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', r.id);
      await supabase.from('profiles').update({ class: r.requestedClass }).eq('id', r.student_id);
    }
    setBusy(null); load(schoolId);
  };

  if (authLoading) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="pt-6 px-5 pb-2"><BackButton to="/principal" /></div>
      <div className="px-6 pt-1 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-black text-slate-900">Class change requests</h1>
          <p className="text-[12px] font-semibold text-slate-500">{rows.length} pending</p>
        </div>
        {rows.length > 0 && (
          <button type="button" disabled={busy === 'all'} onClick={approveAll} className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-[12.5px] font-extrabold disabled:opacity-60">Approve all</button>
        )}
      </div>

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

      <div className="px-5 pt-4 pb-6 flex flex-col gap-3 flex-1">
        {rows.length === 0 ? (
          <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-6 text-center">
            <div className="text-4xl">🎉</div>
            <p className="mt-1 text-[14px] font-extrabold text-slate-900">No pending requests</p>
          </div>
        ) : rows.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-[14px] font-extrabold shrink-0">
              {(r.name || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-extrabold text-slate-900 truncate">{r.name}</div>
              <div className="text-[11.5px] font-semibold text-slate-500">Grade {r.currentClass} → <span className="text-indigo-600 font-extrabold">Grade {r.requestedClass}</span></div>
            </div>
            <button type="button" disabled={busy === r.id} onClick={() => rejectOne(r)} className="h-9 px-3 rounded-xl bg-white ring-1 ring-rose-200 text-rose-600 text-[12px] font-extrabold">Reject</button>
            <button type="button" disabled={busy === r.id} onClick={() => approveOne(r)} className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-[12px] font-extrabold">Approve</button>
          </div>
        ))}
      </div>

      <PrincipalBottomNav />
    </div>
  );
}
