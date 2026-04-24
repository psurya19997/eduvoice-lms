import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
      // principals aren't yet joined to schools via a junction table.
      const { data: all } = await supabase.from('schools').select('id, name').eq('is_active', true).order('name');
      setSchools(all ?? []);
      if ((all ?? []).length > 0) setSchoolId(all[0].id);
    })();
  }, [user]);

  const loadStats = async (sid) => {
    if (!sid) return;
    setLoading(true);
    const [tsRes, coursesRes, reqRes] = await Promise.all([
      supabase.from('teacher_schools').select('id, is_approved, profiles(first_name, email)').eq('school_id', sid),
      supabase.from('courses').select('id', { count: 'exact' }).eq('school_id', sid),
      supabase.from('class_requests').select('id', { count: 'exact' }).eq('school_id', sid).eq('status', 'pending')
    ]);

    const allTS = tsRes.data ?? [];
    setStats({
      totalTeachers: allTS.filter(t => t.is_approved).length,
      pendingTeachers: allTS.filter(t => !t.is_approved).length,
      totalCourses: coursesRes.count ?? 0,
      classRequests: reqRes.count ?? 0
    });
    setPending(allTS.filter(t => !t.is_approved).map(t => ({
      id: t.id,
      name: t.profiles?.first_name || 'Unnamed Teacher',
      email: t.profiles?.email || ''
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (schoolId) loadStats(schoolId);
  }, [schoolId]);

  const approve = async (tsId) => {
    setBusy(tsId);
    await supabase.from('teacher_schools').update({ is_approved: true, is_active: true }).eq('id', tsId);
    await loadStats(schoolId);
    setBusy(null);
  };

  const reject = async (tsId) => {
    setBusy(tsId);
    await supabase.from('teacher_schools').delete().eq('id', tsId);
    await loadStats(schoolId);
    setBusy(null);
  };

  if (authLoading) return <div className="p-10 text-center animate-pulse font-bold text-slate-400">Loading profile...</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24">
      <header className="bg-white border-b border-slate-200 px-5 pt-8 pb-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-[22px] font-black text-slate-900 truncate">
              {profile?.first_name ? `Hi, ${profile.first_name}` : 'Principal Panel'}
            </h1>
            <select 
              value={schoolId} 
              onChange={(e) => setSchoolId(e.target.value)}
              className="mt-0.5 bg-transparent text-indigo-600 font-extrabold text-[13px] outline-none border-none p-0 cursor-pointer"
            >
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button onClick={() => supabase.auth.signOut().then(() => navigate('/'))} className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>

      <div className="p-5 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <Stat emoji="👨‍🏫" label="Teachers" value={stats.totalTeachers} accent="from-blue-500 to-indigo-600" />
          <Stat emoji="📚" label="Courses" value={stats.totalCourses} accent="from-emerald-500 to-teal-600" />
          <Stat emoji="⏳" label="Pending" value={stats.pendingTeachers} accent="from-amber-400 to-orange-500" />
          <Stat emoji="🔔" label="Requests" value={stats.classRequests} accent="from-rose-500 to-pink-600" />
        </div>

        {/* FEATURE ADDITION: Manage Students Link */}
        <Link 
          to="/principal/students" 
          className="flex items-center gap-3 p-4 bg-white rounded-2xl ring-1 ring-slate-200 active:scale-[0.98] transition shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
            👥
          </div>
          <div className="flex-1">
            <p className="font-black text-slate-900 text-[15px]">Manage Students</p>
            <p className="text-xs text-slate-500 font-bold">Enable/Disable accounts class-wise</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-slate-300">
            <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        {/* Pending Approvals */}
        <div className="space-y-4">
          <h2 className="text-[17px] font-black text-slate-900 px-1">Pending Teachers</h2>
          {!loading && pending.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center ring-1 ring-slate-200">
              <p className="text-slate-400 font-bold text-sm">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map(p => (
                <div key={p.id} className="bg-white ring-1 ring-slate-200 rounded-[24px] p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[14px] font-extrabold shrink-0">
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
      </div>

      <PrincipalBottomNav />
    </div>
  );
}

function Stat({ emoji, label, value, accent }) {
  return (
    <div className="relative rounded-2xl bg-white ring-1 ring-slate-200 p-4 overflow-hidden">
      <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full bg-gradient-to-br ${accent} opacity-10`} />
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-[20px] font-black text-slate-900">{value}</div>
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}