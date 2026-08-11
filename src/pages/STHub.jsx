// Story Teller hub — lists stories by level, opens the session player.
// Mirrors WFHub structure so hub UX feels consistent across games,
// but the pedagogical framing is different: each step = one whole story.
// Progress reads: "Not started" / "N of M paragraphs" / "Story done".

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import { loadStProgress } from '../lib/games/stProgress.js';
import { getRefs } from '../lib/games/wfRefs.js';
import { getFlow, nodeToUrl } from '../lib/games/stFlow.js';
import { buildSessionUrl } from '../lib/games/stPracticeNav.js';
import BackButton from '../components/BackButton.jsx';

const DEFAULT_LEVELS = [
  { key: 'alpha', title: 'Alpha', description: '' },
  { key: 'beta',  title: 'Beta',  description: '' },
  { key: 'gamma', title: 'Gamma', description: '' },
];

export default function STHub() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuthProfile('student');

  const [loading, setLoading] = useState(true);
  const [levelProgress, setLevelProgress] = useState({
    started: 0,
    completed: 0,
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
        loadStProgress(profile.id, activeTab),
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

  if (authLoading || loading) return <HeaderShell pointsTotal={pointsTotal}><Spinner /></HeaderShell>;

  const { frontierStep, stepsMeta, completed, total, levelsData } = levelProgress;
  const levelsList = levelsData.length ? levelsData : DEFAULT_LEVELS;

  const activeTabIndex = levelsList.findIndex((l) => l.key === activeTab);
  const currentLevelObj = levelsList[activeTabIndex] || levelsList[0];

  // The story on the highlighted card = the frontier step's story (if any).
  const frontierStory = stepsMeta.find((s) => s.step === frontierStep);
  const hasFrontier = frontierStory && frontierStory.total > 0;

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-y-auto pb-8">
      <Header pointsTotal={pointsTotal} />

      <div className="p-4 flex flex-col gap-4 max-w-md mx-auto w-full">
        {/* Level tabs — same pattern as WFHub for cross-game familiarity */}
        <div className="flex bg-slate-200/70 p-1 rounded-2xl">
          {levelsList.map((lvl) => {
            const isSel = activeTab === lvl.key;
            return (
              <button
                key={lvl.key}
                type="button"
                onClick={() => setActiveTab(lvl.key)}
                className={`flex-1 py-2 rounded-xl text-[12px] font-extrabold transition flex items-center justify-center gap-1 ${
                  isSel ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className="capitalize">{lvl.title || lvl.key}</span>
              </button>
            );
          })}
        </div>

        {/* Featured story card — warm rose/amber for a book/story vibe */}
        <div className="rounded-3xl bg-gradient-to-br from-rose-500 to-amber-600 text-white p-5 shadow-lg flex flex-col gap-4 relative overflow-hidden">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-extrabold mb-1.5">
              <span>📖</span> {completed > 0 ? 'Keep Reading' : 'Story Time'}
            </div>
            <h2 className="text-2xl font-black tracking-tight capitalize">
              Level {activeTabIndex + 1} · {currentLevelObj.title || currentLevelObj.key}
            </h2>
            <p className="text-white/90 text-[13px] font-semibold mt-0.5">
              Listen, read along, and get help when you need it.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between text-[12px] font-extrabold">
              <span className="text-white/90">Stories Read</span>
              <span className="tabular-nums">{completed} / {total}</span>
            </div>
            <div className="h-2 rounded-full bg-black/20 overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-500"
                style={{ width: `${(completed / total) * 100}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={!hasFrontier}
            onClick={() => hasFrontier && openStory(navigate, profile.id, activeTab, frontierStory.step)}
            className={`mt-1 w-full h-12 rounded-2xl text-[15px] font-black shadow-md transition flex items-center justify-center gap-2
              ${hasFrontier
                ? 'bg-white text-rose-700 hover:bg-rose-50 active:scale-[0.98]'
                : 'bg-white/40 text-white/70 cursor-not-allowed'}`}
          >
            {hasFrontier
              ? <>▶ {frontierStory.isComplete ? 'Read Again' : 'Read Story'}: {frontierStory.storyName || `Story ${frontierStory.step}`}</>
              : 'No stories yet'}
          </button>
        </div>

        {/* Story cards grid — one card per step (story). */}
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex items-center justify-between px-1">
            <div className="text-[12px] font-black uppercase tracking-wider text-slate-500 capitalize">
              {currentLevelObj.title || currentLevelObj.key} Stories
            </div>
            <div className="text-[11px] font-extrabold text-slate-400">
              Tap a card to start
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {stepsMeta.map((s) => {
              const noContent = s.total === 0;
              const isComplete = s.isComplete;
              const isFrontier = s.isFrontier;

              // Pedagogy: framing is warm, action-oriented.
              // We never say "locked" or "coming soon" harshly.
              let badgeText = 'Read';
              let badgeColor = 'bg-rose-50 text-rose-700 ring-rose-200';
              let cardStyle  = 'bg-white ring-slate-200 text-slate-800 hover:ring-slate-300';

              if (noContent) {
                badgeText  = '—';
                badgeColor = 'bg-slate-100 text-slate-400 ring-slate-200';
                cardStyle  = 'bg-slate-50/60 ring-slate-200 text-slate-400';
              } else if (isComplete) {
                badgeText  = '✓ Done';
                badgeColor = 'bg-emerald-100 text-emerald-800 ring-emerald-200';
                cardStyle  = 'bg-emerald-50/40 ring-emerald-200 text-emerald-950';
              } else if (isFrontier) {
                badgeText  = '▶ Play';
                badgeColor = 'bg-amber-50 text-amber-700 ring-amber-200';
                cardStyle  = 'bg-rose-50/40 ring-rose-300 text-rose-950 shadow-sm';
              }

              const label = noContent
                ? 'New story coming soon'
                : isComplete
                  ? `${s.total} of ${s.total} paragraphs`
                  : s.started
                    ? `Continue where you left off`   // resume from last-done node
                    : `${s.total} paragraphs · ${estimateMinutes(s.total)} min`;

              return (
                <button
                  key={s.step}
                  type="button"
                  disabled={noContent}
                  onClick={() => openStory(navigate, profile.id, activeTab, s.step)}
                  className={`
                    p-4 rounded-2xl ring-1 flex items-center gap-3 text-left transition
                    ${cardStyle}
                    ${!noContent ? 'active:scale-[0.99]' : 'cursor-not-allowed'}
                  `}
                >
                  <div className="text-3xl shrink-0">
                    {noContent ? '📕' : isComplete ? '📗' : '📖'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-black uppercase tracking-wider opacity-70">
                        Story {s.step}
                      </div>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ring-1 ${badgeColor}`}>
                        {badgeText}
                      </span>
                    </div>
                    <div className="text-[15px] font-black leading-tight mt-0.5 truncate">
                      {s.storyName || (noContent ? '—' : `Story ${s.step}`)}
                    </div>
                    <div className="text-[11px] font-semibold opacity-80 mt-1">
                      {label}
                    </div>
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

/* ---------------- helpers ---------------- */

// Tap → resume where kid left off in the flow (paragraph, item, or bonus).
// If everything's done, resumeIndex points past the last node → complete screen.
// Falls back to paragraph 1 if flow lookup fails.
async function openStory(navigate, studentId, level, step) {
  try {
    const refs = await getRefs();
    const gameId  = refs.games.story_teller;
    const levelId = refs.levels[level];
    if (!gameId || !levelId) throw new Error('missing_refs');

    const { nodes, resumeIndex } = await getFlow({ studentId, gameId, levelId, step });
    const resumeNode = nodes[resumeIndex];   // undefined when everything's done
    navigate(nodeToUrl(resumeNode, { level, step }));
  } catch {
    navigate(buildSessionUrl({ level, step, sessionOrder: 1 }));
  }
}

// Rough reading estimate for the hub card so kids know what they're in for.
// ~25s per paragraph (audio only) + a couple of decisions.
function estimateMinutes(paragraphCount) {
  const seconds = paragraphCount * 35;
  return Math.max(1, Math.round(seconds / 60));
}

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

/* ---------------- header shell ---------------- */

function Header({ pointsTotal }) {
  return (
    <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 shrink-0 bg-white border-b border-slate-200">
      <BackButton to="/student/games" />
      <h1 className="text-[16px] font-black text-slate-900 leading-tight">
        Story Teller
      </h1>
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200">
          <span className="text-[11px]">⚡</span>
          <span className="text-[11px] font-black tabular-nums">{pointsTotal}</span>
        </div>
      </div>
    </div>
  );
}

function HeaderShell({ pointsTotal, children }) {
  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      <Header pointsTotal={pointsTotal} />
      <div className="flex-1 flex items-center justify-center">{children}</div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin text-rose-600" width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
