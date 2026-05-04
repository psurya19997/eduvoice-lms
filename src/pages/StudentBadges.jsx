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

/** 
 * IST-anchored period keys to ensure frontend streaks match 
 * the backend submission logic.[cite: 2]
 */
function weekKey(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function monthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function StudentBadges() {
  const { user, loading: authLoading } = useAuthProfile('student');
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        /**
         * 1. Streaks: Counted live from submissions.[cite: 2]
         * 2. Top-5: Read from `badges` table (populated by backend seal job).[cite: 2, 7]
         */
        const [{ data: subs }, { data: badgeRows }] = await Promise.all([
          supabase
            .from('submissions')
            .select('submitted_at')
            .eq('student_id', user.id)
            .eq('is_visible', true),
          supabase
            .from('badges')
            .select('badge_type, count')
            .eq('student_id', user.id),
        ]);

        if (cancelled) return;

        // Calculate streaks based on unique submission periods[cite: 2]
        const weeks = new Set();
        const months = new Set();
        (subs ?? []).forEach((s) => {
          if (s.submitted_at) {
            weeks.add(weekKey(s.submitted_at));
            months.add(monthKey(s.submitted_at));
          }
        });

        // Map permanent trophies from the backend[cite: 2, 7]
        const byType = Object.fromEntries(
          (badgeRows ?? []).map((r) => [r.badge_type, r.count ?? 0])
        );

        setCounts({
          weekly_streak:  weeks.size,
          monthly_streak: months.size,
          weekly_top5:    byType.weekly_top5  ?? 0,
          monthly_top5:   byType.monthly_top5 ?? 0,
        });
      } catch (error) {
        console.error('Error loading badges:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
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