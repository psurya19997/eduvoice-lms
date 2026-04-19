import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import StudentBottomNav from '../components/StudentBottomNav.jsx';
import BackButton from '../components/BackButton.jsx';

/**
 * Student Leaderboard (PRD §9)
 * - Weekly & Monthly tabs.
 * - Reads rollup rows from `scores` for the student's school, current period.
 * - Shows student's own rank + breakdown (teacher / total-word / unique-word
 *   points) plus the top 3 anonymized.
 */
export default function StudentLeaderboard() {
  const { user, profile, loading: authLoading } = useAuthProfile('student');

  const [tab, setTab] = useState('weekly'); // 'weekly' | 'monthly'
  const [rows, setRows] = useState([]);     // all rows for the period, sorted desc
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const periodStart = useMemo(
    () => (tab === 'weekly' ? mondayOfThisWeek() : firstOfThisMonth()),
    [tab],
  );

  useEffect(() => {
    if (!user || !profile) return;
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: qErr } = await supabase
        .from('scores')
        .select('student_id, teacher_score_total, total_words, unique_words, total_score')
        .eq('school_id', profile.school_id)
        .eq('period_type', tab)
        .eq('period_start', toDateStr(periodStart))
        .order('total_score', { ascending: false });

      if (qErr) {
        setError(qErr.message);
        setLoading(false);
        return;
      }
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [user, profile, tab, periodStart]);

  const myIndex = useMemo(
    () => rows.findIndex((r) => r.student_id === user?.id),
    [rows, user],
  );
  const me = myIndex >= 0 ? rows[myIndex] : null;

  const top3 = rows.slice(0, 3);
  const resetLabel = useMemo(
    () => (tab === 'weekly' ? weeklyResetLabel() : monthlyResetLabel()),
    [tab],
  );

  if (authLoading) return <FullScreenSpinner />;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/student" />
      </div>

      <div className="px-6 pt-1">
        <h1 className="text-[24px] leading-tight font-black text-slate-900">
          Leaderboard 🏆
        </h1>
        <p className="mt-1 text-[13px] font-semibold text-slate-500">
          See how you stack up at your school.
        </p>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-5">
        <div className="grid grid-cols-2 gap-1 bg-white ring-1 ring-slate-200 rounded-2xl p-1">
          <TabBtn label="This week"  active={tab === 'weekly'}  onClick={() => setTab('weekly')}  />
          <TabBtn label="This month" active={tab === 'monthly'} onClick={() => setTab('monthly')} />
        </div>
      </div>

      {loading ? (
        <div className="px-5 pt-5">
          <div className="h-40 rounded-3xl bg-white ring-1 ring-slate-200 animate-pulse" />
          <div className="mt-3 h-56 rounded-3xl bg-white ring-1 ring-slate-200 animate-pulse" />
        </div>
      ) : error ? (
        <div className="px-5 pt-4">
          <div className="rounded-2xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3">
            <p className="text-[13px] font-semibold text-rose-700">{error}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Your rank */}
          <div className="px-5 pt-5">
            <SectionLabel>Your position</SectionLabel>
            <YourRankCard
              me={me}
              rank={me ? myIndex + 1 : null}
              total={rows.length}
            />
            {me && <BreakdownCard me={me} />}
          </div>

          {/* Top 3 anonymized */}
          <div className="px-5 pt-5">
            <SectionLabel>Top 3 (anonymous)</SectionLabel>
            <div className="mt-1.5 rounded-3xl bg-white ring-1 ring-slate-200 p-3 flex flex-col gap-1.5">
              {top3.length === 0 ? (
                <p className="text-[12.5px] font-semibold text-slate-400 p-3 text-center">
                  No one's on the board yet this period.
                </p>
              ) : (
                top3.map((r, i) => (
                  <AnonRow
                    key={r.student_id}
                    rank={i + 1}
                    score={r.total_score}
                    isMe={r.student_id === user?.id}
                  />
                ))
              )}
            </div>
          </div>

          {/* Reset countdown */}
          <div className="px-6 pt-5 pb-8 text-center">
            <p className="text-[12px] font-bold text-slate-500">
              ⏳ {resetLabel}
            </p>
          </div>
        </>
      )}

      <StudentBottomNav />
    </div>
  );
}

/* ---------- pieces ---------- */

function TabBtn({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        h-11 rounded-xl text-[13px] font-extrabold transition
        ${active
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
          : 'text-slate-500 hover:text-slate-700'}
      `}
    >
      {label}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 pl-1">
      {children}
    </div>
  );
}

function YourRankCard({ me, rank, total }) {
  if (!me) {
    return (
      <div className="mt-1.5 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white p-5 shadow-lg shadow-indigo-600/20">
        <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
          Not on the board yet
        </div>
        <div className="mt-1 text-[20px] font-black">
          Submit an assignment to get started 🚀
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1.5 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white p-5 shadow-lg shadow-indigo-600/20">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
            Your rank
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[44px] leading-none font-black">#{rank}</span>
            <span className="text-[13px] font-bold opacity-80">of {total}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-extrabold uppercase tracking-wide opacity-80">
            Total score
          </div>
          <div className="mt-1 text-[32px] leading-none font-black">
            {me.total_score}
          </div>
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({ me }) {
  const wordPts = me.total_words * 1;
  const uniquePts = me.unique_words * 3;
  return (
    <div className="mt-3 rounded-3xl bg-white ring-1 ring-slate-200 p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
        Breakdown
      </div>
      <BreakdownRow
        emoji="⭐"
        label="Teacher points"
        value={me.teacher_score_total}
        sub={null}
      />
      <BreakdownRow
        emoji="📝"
        label="Word points"
        value={wordPts}
        sub={`${me.total_words} words × 1`}
      />
      <BreakdownRow
        emoji="💎"
        label="Unique word points"
        value={uniquePts}
        sub={`${me.unique_words} unique × 3`}
      />
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[13.5px] font-extrabold text-slate-900">Total</span>
        <span className="text-[18px] font-black text-indigo-600">{me.total_score}</span>
      </div>
    </div>
  );
}

function BreakdownRow({ emoji, label, value, sub }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-9 h-9 rounded-xl bg-slate-50 ring-1 ring-slate-100 flex items-center justify-center text-lg">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-extrabold text-slate-900">{label}</div>
        {sub && <div className="text-[11px] font-semibold text-slate-500">{sub}</div>}
      </div>
      <div className="text-[15px] font-black text-slate-900">{value}</div>
    </div>
  );
}

function AnonRow({ rank, score, isMe }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
  return (
    <div className={`
      flex items-center gap-3 px-3 py-3 rounded-2xl
      ${isMe ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}
    `}>
      <div className="w-9 h-9 rounded-full bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center text-[14px] font-black text-slate-700">
        {medal || `#${rank}`}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-extrabold text-slate-800">
          Anonymous student {isMe && (
            <span className="ml-1 text-[10.5px] font-extrabold text-indigo-700 bg-indigo-100 rounded-full px-2 py-0.5">
              YOU
            </span>
          )}
        </div>
        <div className="text-[11px] font-semibold text-slate-500">Rank #{rank}</div>
      </div>
      <div className="text-[16px] font-black text-slate-900">{score}</div>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="h-full flex items-center justify-center bg-slate-50">
      <svg className="animate-spin text-indigo-600" width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ---------- date helpers (client-local) ---------- */

function mondayOfThisWeek() {
  const d = new Date();
  const day = d.getDay();               // 0 = Sun, 1 = Mon, … 6 = Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function firstOfThisMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weeklyResetLabel() {
  const next = mondayOfThisWeek();
  next.setDate(next.getDate() + 7);
  return resetLabelFor(next, 'Resets');
}
function monthlyResetLabel() {
  const next = firstOfThisMonth();
  next.setMonth(next.getMonth() + 1);
  return resetLabelFor(next, 'Resets');
}
function resetLabelFor(nextReset, verb) {
  const ms = nextReset.getTime() - Date.now();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  if (days >= 1) return `${verb} in ${days} day${days === 1 ? '' : 's'}`;
  if (hours >= 1) return `${verb} in ${hours} hour${hours === 1 ? '' : 's'}`;
  const mins = Math.max(1, Math.floor(ms / (1000 * 60)));
  return `${verb} in ${mins} minute${mins === 1 ? '' : 's'}`;
}
