import { useEffect, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import PrincipalBottomNav from '../components/PrincipalBottomNav.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function PrincipalCourses() {
  const { loading: authLoading } = useAuthProfile('principal');
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [courses, setCourses] = useState([]);
  const [tab, setTab] = useState('active');
  const [confirm, setConfirm] = useState(null); // course being disabled
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('schools').select('id, name').eq('is_active', true).order('name');
      setSchools(data ?? []); if ((data ?? []).length > 0) setSchoolId(data[0].id);
    })();
  }, []);

  const load = async (sid) => {
    if (!sid) return;
    const { data } = await supabase.from('courses').select(`
      id, title, is_active,
      teacher:profiles!courses_teacher_id_fkey(first_name, last_name),
      course_classes(class), assignments(id)
    `).eq('school_id', sid).order('title');
    setCourses((data ?? []).map((c) => ({
      id: c.id, title: c.title, is_active: c.is_active,
      teacher: c.teacher ? `${c.teacher.first_name ?? ''} ${c.teacher.last_name ?? ''}`.trim() : 'Teacher',
      classes: (c.course_classes ?? []).map((r) => r.class).sort((a, b) => a - b),
      assignments: (c.assignments ?? []).length,
    })));
  };
  useEffect(() => { load(schoolId); }, [schoolId]);

  const toggle = async (id, next) => {
    setBusy(id);
    await supabase.from('courses').update({ is_active: next }).eq('id', id);
    setBusy(null); setConfirm(null); load(schoolId);
  };

  const filtered = courses.filter((c) => (tab === 'active' ? c.is_active : !c.is_active));
  if (authLoading) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="pt-6 px-5 pb-2"><BackButton to="/principal" /></div>
      <div className="px-6 pt-1"><h1 className="text-[22px] font-black text-slate-900">Courses</h1></div>

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

      <div className="px-5 pt-4">
        <div className="grid grid-cols-2 gap-1 bg-white ring-1 ring-slate-200 rounded-2xl p-1">
          {['active', 'disabled'].map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`h-11 rounded-xl text-[12.5px] font-extrabold capitalize
              ${tab === t ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-500'}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-4 pb-6 flex flex-col gap-3 flex-1">
        {filtered.length === 0 ? (
          <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-6 text-center text-[13px] font-semibold text-slate-500">No courses in this view.</div>
        ) : filtered.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl ring-1 ring-slate-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xl shrink-0">📘</div>
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-extrabold text-slate-900 truncate">{c.title}</div>
                <div className="text-[11.5px] font-semibold text-slate-500 truncate">with {c.teacher}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.classes.map((n) => (<span key={n} className="text-[10px] font-bold text-indigo-700 bg-indigo-50 ring-1 ring-indigo-100 rounded-full px-2 py-0.5">G{n}</span>))}
                </div>
                <div className="mt-1 text-[11.5px] font-semibold text-slate-500">📝 {c.assignments} assignment{c.assignments === 1 ? '' : 's'}</div>
              </div>
              {c.is_active ? (
                <button type="button" onClick={() => setConfirm(c)} className="h-9 px-3 rounded-xl bg-white ring-1 ring-rose-200 text-rose-600 text-[12px] font-extrabold">Disable</button>
              ) : (
                <button type="button" disabled={busy === c.id} onClick={() => toggle(c.id, true)} className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-[12px] font-extrabold">Enable</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirm && (
        <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-auto bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
            <div className="flex justify-center"><div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-3xl">⚠️</div></div>
            <h3 className="mt-3 text-[19px] font-black text-slate-900 text-center">Disable "{confirm.title}"?</h3>
            <p className="mt-1.5 text-[13px] font-semibold text-slate-500 text-center">Students will no longer see this course. You can re-enable later.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirm(null)} className="h-12 rounded-2xl bg-slate-100 text-slate-700 text-[14px] font-extrabold">Cancel</button>
              <button type="button" disabled={busy === confirm.id} onClick={() => toggle(confirm.id, false)} className="h-12 rounded-2xl bg-rose-600 text-white text-[14px] font-extrabold">Disable</button>
            </div>
          </div>
        </div>
      )}

      <PrincipalBottomNav />
    </div>
  );
}
