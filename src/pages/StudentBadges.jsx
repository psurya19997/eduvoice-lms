import { useEffect, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import StudentBottomNav from '../components/StudentBottomNav.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

const BADGES = [
  { type: 'weekly_streak',  emoji: '🔥', name: 'Weekly Streak',  desc: 'Weeks with at least 1 submission' },
  { type: 'monthly_streak', emoji: '🏆', name: 'Monthly Streak', desc: 'Months with at least 1 submission' },
  { type: 'weekly_top5',    emoji: '⭐', name: 'Weekly Top 5',   desc: 'Times ranked top 5 weekly' },
  { type: 'monthly_top5',   emoji: '🥇', name: 'Monthly Top 5',  desc: 'Times ranked top 5 monthly' },
];

/** Monday of the week containing `d`, at local midnight. */
function weekKey(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}
function monthKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

export default function StudentBadges() {
  const { user, loading: authLoading } = useAuthProfile('student');
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('submissions')
        .select('submitted_at')
        .eq('student_id', user.id);

      const weeks = new Set();
      const months = new Set();
      for (const row of data ?? []) {
        if (!row.submitted_at) continue;
        weeks.add(weekKey(row.submitted_at));
        months.add(monthKey(row.submitted_at));
      }
      setCounts({
        weekly_streak:  weeks.size,
        monthly_streak: months.size,
        weekly_top5:    0, // TODO: rank history
        monthly_top5:   0, // TODO: rank history
      });
      setLoading(false);
    })();
  }, [user]);

  if (authLoading) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="pt-6 px-5 pb-2"><BackButton to="/student" /></div>
      <div className="px-6 pt-1">
        <h1 className="text-[24px] leading-tight font-black text-slate-900">Badges 🎖️</h1>
        <p className="mt-1 text-[13px] font-semibold text-slate-500">Your earned achievements.</p>
      </div>

      <div className="px-5 pt-5 pb-8 flex flex-col gap-3">
        {BADGES.map((b) => {
          const count = counts[b.type] ?? 0;
          const earned = count > 0;
          return (
            <div key={b.type} className={`
              rounded-3xl p-4 ring-1 flex items-center gap-4 transition
              ${earned ? 'bg-white ring-slate-200 shadow-sm' : 'bg-slate-100 ring-slate-200 opacity-70'}
            `}>
              <div className={`
                w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0
                ${earned ? 'bg-gradient-to-br from-amber-100 to-rose-100' : 'bg-slate-200'}
              `}>
                {earned ? b.emoji : '🔒'}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[15px] font-extrabold truncate ${earned ? 'text-slate-900' : 'text-slate-500'}`}>
                  {b.name}
                </div>
                <div className="text-[11.5px] font-semibold text-slate-500 truncate">{b.desc}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-[24px] font-black leading-none ${earned ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {loading ? '–' : count}
                </div>
                <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 mt-0.5">earned</div>
              </div>
            </div>
          );
        })}
      </div>

      <StudentBottomNav />
    </div>
  );
}
