import { useEffect, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import PrincipalBottomNav from '../components/PrincipalBottomNav.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function PrincipalTeachers() {
  const { loading: authLoading } = useAuthProfile('principal');
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('schools').select('id, name').eq('is_active', true).order('name');
      setSchools(data ?? []);
      if ((data ?? []).length > 0) setSchoolId(data[0].id);
    })();
  }, []);

  const load = async (sid) => {
    if (!sid) return;
    const { data } = await supabase.from('teacher_schools')
      .select('id, is_approved, is_active, teacher:profiles!teacher_schools_teacher_id_fkey(first_name, last_name, email)')
      .eq('school_id', sid);
    setRows((data ?? []).map((r) => ({
      id: r.id, is_approved: r.is_approved, is_active: r.is_active,
      name: r.teacher ? `${r.teacher.first_name ?? ''} ${r.teacher.last_name ?? ''}`.trim() : 'Teacher',
      email: r.teacher?.email ?? '',
    })));
  };
  useEffect(() => { load(schoolId); }, [schoolId]);

  const act = async (fn, id) => { setBusy(id); await fn(); setBusy(null); load(schoolId); };
  const approve = (id) => act(() => supabase.from('teacher_schools').update({ is_approved: true }).eq('id', id), id);
  const reject  = (id) => act(() => supabase.from('teacher_schools').delete().eq('id', id), id);
  const disable = (id) => act(() => supabase.from('teacher_schools').update({ is_active: false }).eq('id', id), id);
  const enable  = (id) => act(() => supabase.from('teacher_schools').update({ is_active: true }).eq('id', id), id);

  const filtered = rows.filter((r) =>
    tab === 'pending'  ? (r.is_active && !r.is_approved) :
    tab === 'disabled' ? !r.is_active :
                         true
  );

  if (authLoading) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="pt-6 px-5 pb-2"><BackButton to="/principal" /></div>
      <div className="px-6 pt-1"><h1 className="text-[22px] font-black text-slate-900">Teachers</h1></div>

      {schools.length > 1 && (
        <div className="px-5 pt-3 overflow-x-auto">
          <div className="flex gap-2 whitespace-nowrap">
            {schools.map((s) => (
              <button key={s.id} type="button" onClick={() => setSchoolId(s.id)} className={`
                h-9 px-3 rounded-full text-[12.5px] font-extrabold ring-1
                ${s.id === schoolId ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200'}
              `}>{s.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 pt-4">
        <div className="grid grid-cols-3 gap-1 bg-white ring-1 ring-slate-200 rounded-2xl p-1">
          {['all', 'pending', 'disabled'].map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`
              h-11 rounded-xl text-[12.5px] font-extrabold capitalize
              ${tab === t ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-500'}
            `}>{t}</button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-4 pb-6 flex flex-col gap-3 flex-1">
        {filtered.length === 0 ? (
          <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-6 text-center text-[13px] font-semibold text-slate-500">No teachers in this view.</div>
        ) : filtered.map((r) => {
          const pending = r.is_active && !r.is_approved;
          return (
            <div key={r.id} className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full text-white flex items-center justify-center text-[14px] font-extrabold shrink-0
                ${r.is_active ? 'bg-gradient-to-br from-indigo-500 to-violet-600' : 'bg-slate-300'}`}>
                {(r.name || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-extrabold text-slate-900 truncate">{r.name}</div>
                <div className="text-[11.5px] font-semibold text-slate-500 truncate">{r.email}</div>
              </div>
              {pending && (<>
                <button type="button" disabled={busy === r.id} onClick={() => reject(r.id)} className="h-9 px-3 rounded-xl bg-white ring-1 ring-rose-200 text-rose-600 text-[12px] font-extrabold">Reject</button>
                <button type="button" disabled={busy === r.id} onClick={() => approve(r.id)} className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-[12px] font-extrabold">Approve</button>
              </>)}
              {r.is_active && r.is_approved && (
                <button type="button" disabled={busy === r.id} onClick={() => disable(r.id)} className="h-9 px-3 rounded-xl bg-white ring-1 ring-rose-200 text-rose-600 text-[12px] font-extrabold">Disable</button>
              )}
              {!r.is_active && (
                <button type="button" disabled={busy === r.id} onClick={() => enable(r.id)} className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-[12px] font-extrabold">Enable</button>
              )}
            </div>
          );
        })}
      </div>

      <PrincipalBottomNav />
    </div>
  );
}
