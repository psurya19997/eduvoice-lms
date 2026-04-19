import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import PrincipalBottomNav from '../components/PrincipalBottomNav.jsx';

export default function PrincipalDashboard() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuthProfile('principal');
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [stats, setStats] = useState({ totalTeachers: 0, pendingTeachers: 0, totalCourses: 0, classRequests: 0 });
  const [pending, setPending] = useState([]); // pending teacher approvals for selected school
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // TODO: principals aren't yet joined to schools via a junction table.
      // For now, show all active schools.
      const { data: all } = await supabase.from('schools').select('id, name').eq('is_active', true).order('name');
      setSchools(all ?? []);
      if ((all ?? []).length > 0) setSchoolId(all[0].id);
    })();
  }, [user]);

  const loadStats = async (sid) => {
    if (!sid) return;
    setLoading(true);
    const [tsRes, coursesRes, reqRes] = await Promise.all([
      supabase.from('teacher_schools').select('id, is_approved, is_active, teacher_id, joined_at, teacher:profiles!teacher_schools_teacher_id_fkey(first_name, last_name, email)').eq('school_id', sid).eq('is_active', true),
      supabase.from('courses').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('is_active', true),
      supabase.from('class_change_requests').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('status', 'pending'),
    ]);
    const ts = tsRes.data ?? [];
    setPending(ts.filter((r) => !r.is_approved).map((r) => ({
      id: r.id,
      name: r.teacher ? `${r.teacher.first_name ?? ''} ${r.teacher.last_name ?? ''}`.trim() : 'Teacher',
      email: r.teacher?.email ?? '',
      joinedAt: r.joined_at,
    })));
    setStats({
      totalTeachers: ts.filter((r) => r.is_approved).length,
      pendingTeachers: ts.filter((r) => !r.is_approved).length,
      totalCourses: coursesRes.count ?? 0,
      classRequests: reqRes.count ?? 0,
    });
    setLoading(false);
  };

  useEffect(() => { loadStats(schoolId); /* eslint-disable-next-line */ }, [schoolId]);

  const approve = async (id) => {
    setBusy(id);
    await supabase.from('teacher_schools').update({ is_approved: true }).eq('id', id);
    setBusy(null); loadStats(schoolId);
  };
  const reject = async (id) => {
    setBusy(id);
    await supabase.from('teacher_schools').delete().eq('id', id);
    setBusy(null); loadStats(schoolId);
  };
  const signOut = async () => { await supabase.auth.signOut(); navigate('/login', { replace: true }); };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, []);

  if (authLoading || !profile) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-slate-500">{greeting},</p>
          <h1 className="text-[22px] leading-tight font-black text-slate-900 truncate">{profile.first_name ?? 'Principal'} 👋</h1>
        </div>
        <button type="button" onClick={signOut} className="shrink-0 h-10 px-3 rounded-xl bg-white ring-1 ring-slate-200 text-[12px] font-bold text-slate-600 hover:text-slate-800">Sign out</button>
      </div>

      {schools.length > 1 && (
        <div className="px-5 pt-1 pb-3 overflow-x-auto">
          <div className="flex gap-2 whitespace-nowrap">
            {schools.map((s) => (
              <button key={s.id} type="button" onClick={() => setSchoolId(s.id)} className={`
                h-9 px-3 rounded-full text-[12.5px] font-extrabold ring-1 transition
                ${s.id === schoolId ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}
              `}>{s.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 grid grid-cols-2 gap-3">
        <Stat emoji="👨‍🏫" label="Teachers" value={stats.totalTeachers} accent="from-indigo-500 to-violet-600" />
        <Stat emoji="⏳" label="Pending teachers" value={stats.pendingTeachers} accent="from-amber-500 to-orange-500" />
        <Stat emoji="📚" label="Courses" value={stats.totalCourses} accent="from-emerald-500 to-teal-500" />
        <Stat emoji="🔄" label="Class requests" value={stats.classRequests} accent="from-pink-500 to-rose-500" />
      </div>

      <div className="px-6 pt-6 pb-2">
        <h2 className="text-[16px] font-extrabold text-slate-900">Pending teacher approvals</h2>
        <p className="text-[12px] font-semibold text-slate-500">Tap Approve to grant access, Reject to remove.</p>
      </div>

      <div className="px-5 pb-6 flex-1">
        {loading ? (
          <div className="h-24 rounded-3xl bg-white ring-1 ring-slate-200 animate-pulse" />
        ) : pending.length === 0 ? (
          <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-6 text-center">
            <div className="text-4xl">✅</div>
            <p className="mt-1 text-[14px] font-extrabold text-slate-900">All caught up!</p>
            <p className="text-[12px] font-semibold text-slate-500">No pending teacher approvals.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-[14px] font-extrabold shrink-0">
                  {(p.name || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-extrabold text-slate-900 truncate">{p.name}</div>
                  <div className="text-[11.5px] font-semibold text-slate-500 truncate">{p.email}</div>
                </div>
                <button type="button" disabled={busy === p.id} onClick={() => reject(p.id)} className="h-9 px-3 rounded-xl bg-white ring-1 ring-rose-200 text-rose-600 text-[12px] font-extrabold disabled:opacity-50">Reject</button>
                <button type="button" disabled={busy === p.id} onClick={() => approve(p.id)} className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-[12px] font-extrabold disabled:opacity-50">Approve</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <PrincipalBottomNav />
    </div>
  );
}

function Stat({ emoji, label, value, accent }) {
  return (
    <div className="relative rounded-2xl bg-white ring-1 ring-slate-200 p-4 overflow-hidden">
      <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full bg-gradient-to-br ${accent} opacity-20`} />
      <div className="text-[20px]">{emoji}</div>
      <div className="mt-1 text-[24px] font-black text-slate-900 leading-none">{value}</div>
      <div className="mt-1 text-[12px] font-bold text-slate-500">{label}</div>
    </div>
  );
}
