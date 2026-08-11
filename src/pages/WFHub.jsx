import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import { loadWfProgress } from '../lib/games/wfProgress.js';
import BackButton from '../components/BackButton.jsx';

const DEFAULT_LEVELS = [
  { key: 'alpha', title: 'Alpha', description: '' },
  { key: 'beta', title: 'Beta', description: '' },
  { key: 'gamma', title: 'Gamma', description: '' },
];

export default function WFHub() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuthProfile('student');

  const [loading, setLoading] = useState(true);
  const [levelProgress, setLevelProgress] = useState({
    started: 0,
    total: 10,
    frontierStep: 1,
    stepsMeta: [],
    levelsData: DEFAULT_LEVELS,
    frontierLevel: 'alpha',
  });
  const [pointsTotal, setPointsTotal] = useState(0);
  const [activeTab, setActiveTab] = useState('alpha');

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [prog, pts] = await Promise.all([
        loadWfProgress(profile.id, activeTab),
        loadPointsTotal(profile.id),
      ]);
      if (!cancelled) {
        setLevelProgress(prog);
        setPointsTotal(pts);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile, activeTab]);

  if (authLoading || loading) {
    return (
      <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <BackButton to="/student/games" />
          <div className="text-[15px] font-black text-slate-900">Word Family</div>
          <div className="w-8" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <svg className="animate-spin text-indigo-600" width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    );
  }

  const { frontierStep, stepsMeta, started, total, levelsData } = levelProgress;
  const levelsList = levelsData.length ? levelsData : DEFAULT_LEVELS;

  const activeTabIndex = levelsList.findIndex((l) => l.key === activeTab);
  const currentLevelObj = levelsList[activeTabIndex] || levelsList[0];

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-y-auto pb-8">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 shrink-0 bg-white border-b border-slate-200">
        <BackButton to="/student/games" />
        <h1 className="text-[16px] font-black text-slate-900 leading-tight">
          Word Family
        </h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200">
            <span className="text-[11px]">⚡</span>
            <span className="text-[11px] font-black tabular-nums">{pointsTotal}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 flex flex-col gap-4 max-w-md mx-auto w-full">
        {/* Horizontal Level Tabs */}
        <div className="flex bg-slate-200/70 p-1 rounded-2xl">
          {levelsList.map((lvl) => {
            const isSel = activeTab === lvl.key;
            return (
              <button
                key={lvl.key}
                type="button"
                onClick={() => setActiveTab(lvl.key)}
                className={`flex-1 py-2 rounded-xl text-[12px] font-extrabold transition flex items-center justify-center gap-1 ${
                  isSel ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className="capitalize">{lvl.title || lvl.key}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Level View */}
            {/* Active Level Overview Card */}
            <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-5 shadow-lg flex flex-col gap-4 relative overflow-hidden">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-extrabold mb-1.5">
                  <span>🟢</span> In Progress
                </div>
                <h2 className="text-2xl font-black tracking-tight capitalize">
                  Level {activeTabIndex + 1} · {currentLevelObj.title || currentLevelObj.key}
                </h2>
                {currentLevelObj.description ? (
                  <p className="text-white/80 text-[13px] font-semibold mt-0.5">
                    {currentLevelObj.description}
                  </p>
                ) : null}
              </div>

              {/* Progress bar inside card */}
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex items-center justify-between text-[12px] font-extrabold">
                  <span className="text-white/90">Level Progress</span>
                  <span className="tabular-nums">{started} / {total} Steps</span>
                </div>
                <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${(started / total) * 100}%` }}
                  />
                </div>
              </div>

              {/* Primary Action Button */}
              <button
                type="button"
                onClick={() => navigate(`/student/games/word-family/play?level=${activeTab}&step=${frontierStep}`)}
                className="mt-1 w-full h-12 rounded-2xl bg-white text-indigo-700 text-[15px] font-black shadow-md hover:bg-slate-50 active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                <span>▶</span> Continue Step {frontierStep}
              </button>
            </div>

            {/* Spaced Retrieval Roadmap (Selected Level Grid) */}
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center justify-between px-1">
                <div className="text-[12px] font-black uppercase tracking-wider text-slate-500 capitalize">
                  {currentLevelObj.title || currentLevelObj.key} Roadmap
                </div>
                <div className="text-[11px] font-extrabold text-slate-400">
                  Spaced Retrieval Grid
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {stepsMeta.map((s) => {
                  const isFrontier = s.step === frontierStep && !s.isComplete;
                  const noContent = s.total === 0;
                  const isComplete = s.isComplete;

                  let badgeText = '▶ Practice';
                  let badgeColor = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
                  let cardStyle = 'bg-white ring-slate-200 text-slate-800 hover:ring-slate-300';

                  if (noContent) {
                    badgeText = 'No content';
                    badgeColor = 'bg-slate-100 text-slate-400 ring-slate-200';
                    cardStyle = 'bg-slate-50/60 ring-slate-200 text-slate-400';
                  } else if (isComplete) {
                    badgeText = '✓ Done';
                    badgeColor = 'bg-emerald-100 text-emerald-800 ring-emerald-200';
                    cardStyle = 'bg-emerald-50/40 ring-emerald-200 text-emerald-950';
                  } else if (isFrontier) {
                    badgeText = '▶ Play';
                    badgeColor = 'bg-amber-50 text-amber-700 ring-amber-200';
                    cardStyle = 'bg-indigo-50/50 ring-indigo-300 text-indigo-950 shadow-sm';
                  }

                  return (
                    <button
                      key={s.step}
                      type="button"
                      disabled={noContent}
                      onClick={() => navigate(`/student/games/word-family/play?level=${activeTab}&step=${s.step}`)}
                      className={`
                        p-3.5 rounded-2xl ring-1 flex flex-col justify-between gap-2 text-left transition
                        ${cardStyle}
                        ${!noContent ? 'active:scale-[0.97]' : 'cursor-not-allowed'}
                      `}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[16px] font-black">Step {s.step}</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ring-1 ${badgeColor}`}>
                          {badgeText}
                        </span>
                      </div>
                      {!noContent && (
                        <div className="h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isComplete ? 'bg-emerald-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${(s.done / s.total) * 100}%` }}
                          />
                        </div>
                      )}
                      <div className="text-[11px] font-semibold opacity-80">
                        {noContent
                          ? 'Coming soon'
                          : isComplete
                            ? 'All sessions done'
                            : `${s.done} of ${s.total} sessions done`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
      </div>
    </div>
  );
}

/* ---------------- Helper functions ---------------- */

async function loadPointsTotal(studentId) {
  try {
    const { data } = await supabase
      .from('game_score')
      .select('points')
      .eq('student_id', studentId);
    return (data ?? []).reduce((s, r) => s + (r.points ?? 0), 0);
  } catch {
    return 0;
  }
}
