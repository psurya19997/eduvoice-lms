// STSession — the paragraph reading experience (iteration 2).
// Layout inversion: player + controls + decisions all at the top; text
// scroll area fills the rest. The active sentence auto-scrolls to center.
//
// Pedagogy notes:
//   - Text size control (A/A/A) — respects varied readers, saved per device.
//   - Speed control (0.75/1/1.25×) — some kids need it slower, some can go faster.
//   - Hide/Show toggle on decisions — after audio ends, kid can quietly re-read
//     the text without buttons in the way; taps "Show options" when ready.
//   - Auto-scroll follows the karaoke highlight so the child never scrolls.
//   - Non-active sentences readable (slate-600), not dim, so context stays visible.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import { getRefs } from '../lib/games/wfRefs.js';
import { useSTAudio } from '../lib/games/useSTAudio.js';
import {
  fetchInlineItems, fetchStoryEndItems,
  buildPracticeUrl, buildSessionUrl, buildCompleteUrl,
} from '../lib/games/stPracticeNav.js';
import { getFlow, nodeToUrl, indexOfCurrent } from '../lib/games/stFlow.js';
import BackButton from '../components/BackButton.jsx';
import STFlowNav from '../components/games/st/STFlowNav.jsx';

const AUDIO_BUCKET = 'game-assets';

const TEXT_SIZES = [20, 22, 24];
const SPEEDS = [
  { key: '0.75', label: '0.75×', rate: 0.75 },
  { key: '1',    label: '1×',    rate: 1.0  },
  { key: '1.25', label: '1.25×', rate: 1.25 },
];

const LS_TEXT_SIZE = 'st_text_size';
const LS_SPEED     = 'st_speed';

export default function STSession() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const level  = params.get('level')   ?? 'alpha';
  const step   = Number(params.get('step')    ?? 1);
  const sessionOrder = Number(params.get('session') ?? 1);

  const { profile, loading: authLoading } = useAuthProfile('student');

  const [loading, setLoading] = useState(true);
  const [sessionRow, setSessionRow] = useState(null);
  const [nextSessionRow, setNextSessionRow] = useState(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [lang, setLang] = useState('en');
  const [fetchError, setFetchError] = useState(null);

  const [hasStarted, setHasStarted] = useState(false);
  const [showDecisions, setShowDecisions] = useState(true);   // reset per paragraph

  // Flow context for prev/next nav — refetched whenever (student, level, step) changes.
  const [flow, setFlow] = useState({ nodes: [], resumeIndex: 0 });

  // Per-device preferences (persisted in localStorage).
  const [textSize, setTextSize] = useState(() => {
    const stored = Number(localStorage.getItem(LS_TEXT_SIZE));
    return TEXT_SIZES.includes(stored) ? stored : 22;
  });
  const [speedKey, setSpeedKey] = useState(() => {
    const stored = localStorage.getItem(LS_SPEED);
    return SPEEDS.some((s) => s.key === stored) ? stored : '1';
  });
  const speedRate = SPEEDS.find((s) => s.key === speedKey)?.rate ?? 1;

  useEffect(() => { localStorage.setItem(LS_TEXT_SIZE, String(textSize)); }, [textSize]);
  useEffect(() => { localStorage.setItem(LS_SPEED, speedKey); }, [speedKey]);

  const audioRef = useRef(null);
  const startedAtRef = useRef(Date.now());
  const clickedRef = useRef(false);
  const sentenceRefs = useRef([]);              // for auto-scroll
  const scrollContainerRef = useRef(null);

  const sentences = useMemo(() => {
    if (!sessionRow) return [];
    return lang === 'en' ? sessionRow.sentences_en : sessionRow.sentences_hi_mix;
  }, [sessionRow, lang]);

  const audioPath = sessionRow
    ? (lang === 'en' ? sessionRow.audio_en_url : sessionRow.audio_hi_mix_url)
    : null;
  const audioUrl = useMemo(() => (audioPath ? publicUrl(audioPath) : null), [audioPath]);

  const nextAudioUrl = useMemo(() => {
    if (!nextSessionRow) return null;
    return publicUrl(nextSessionRow.audio_en_url);
  }, [nextSessionRow]);

  // ---- Fetch: current session + next session + total count ----
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const refs = await getRefs();
        const gameId  = refs.games.story_teller;
        const levelId = refs.levels[level];
        if (!gameId || !levelId) throw new Error('missing_refs');

        const { data: rows, error } = await supabase
          .from('storyteller_sessions')
          .select('*')
          .eq('game_id', gameId)
          .eq('level_id', levelId)
          .eq('step', step)
          .eq('is_active', true)
          .order('session_order', { ascending: true });
        if (error) throw error;

        if (cancelled) return;
        const current = rows.find((r) => r.session_order === sessionOrder);
        const next    = rows.find((r) => r.session_order === sessionOrder + 1);
        if (!current) throw new Error('session_not_found');

        setSessionRow(current);
        setNextSessionRow(next ?? null);
        setTotalSessions(rows.length);
        setLang('en');
        setHasStarted(false);
        setShowDecisions(true);
        sentenceRefs.current = [];
        startedAtRef.current = Date.now();
        clickedRef.current   = false;
      } catch (e) {
        if (!cancelled) setFetchError(e.message ?? 'unknown');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile, level, step, sessionOrder]);

  // Load the flow list once per (student, level, step) so the chevrons work.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      try {
        const refs = await getRefs();
        const gameId  = refs.games.story_teller;
        const levelId = refs.levels[level];
        if (!gameId || !levelId) return;
        const f = await getFlow({ studentId: profile.id, gameId, levelId, step });
        if (!cancelled) setFlow(f);
      } catch { /* nav simply stays disabled if this fails */ }
    })();
    return () => { cancelled = true; };
  }, [profile, level, step]);

  const audio = useSTAudio({
    audioRef,
    sentences,
    onError: async (code) => {
      if (!profile || !sessionRow) return;
      await supabase.from('storyteller_errors').insert({
        student_id: profile.id,
        session_id: sessionRow.id,
        error_code: code,
        detail: { url: audioUrl },
      }).then(() => {}).catch(() => {});
    },
  });

  useEffect(() => { startedAtRef.current = Date.now(); }, [sessionRow?.id]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    el.load();
  }, [audioUrl]);

  // Apply playback rate on element whenever it or the audio changes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speedRate;
  }, [speedRate, audioUrl]);

  // Auto-scroll: keep the active sentence centered in the scroll area.
  useEffect(() => {
    const idx = audio.activeIndex;
    if (idx < 0) return;
    const el = sentenceRefs.current[idx];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [audio.activeIndex]);

  // Aborted-attempt writer — fires only on unmount without a decision click.
  const abortRef = useRef({});
  abortRef.current = { profile, sessionRow, clickedRef, startedAtRef };
  useEffect(() => {
    return () => {
      const { profile: p, sessionRow: s, clickedRef: c, startedAtRef: t } = abortRef.current;
      if (!p || !s || c.current) return;
      supabase.from('storyteller_attempts').insert({
        student_id: p.id,
        session_id: s.id,
        choice_made: null,
        attempt_status: 'aborted',
        duration_ms: Date.now() - t.current,
      }).then(() => {}).catch(() => {});
    };
  }, []);

  const logAttempt = async (choice) => {
    if (!profile || !sessionRow) return;
    clickedRef.current = true;
    await supabase.from('storyteller_attempts').insert({
      student_id: profile.id,
      session_id: sessionRow.id,
      choice_made: choice,
      attempt_status: 'completed',
      duration_ms: Date.now() - startedAtRef.current,
    }).then(() => {}).catch(() => {});
  };

  const handleUnderstood = async () => {
    await logAttempt('understood');

    // Practice-item dispatch: after "understood", check if this paragraph has
    // any inline practice items. If so, route to STPractice for the first one.
    // STPractice handles chained items + return-to-flow on Continue.
    if (sessionRow?.id) {
      const inline = await fetchInlineItems(sessionRow.id);
      if (inline.length > 0) {
        navigate(buildPracticeUrl({
          level, step, sessionOrder,
          itemId: inline[0].id, batch: 'inline',
        }));
        return;
      }
    }

    // No inline items → advance to next paragraph, or wrap up the story.
    if (sessionOrder < totalSessions) {
      navigate(buildSessionUrl({ level, step, sessionOrder: sessionOrder + 1 }));
      return;
    }

    // Last paragraph, no inline items — check story-end items.
    try {
      const refs = await getRefs();
      const endItems = await fetchStoryEndItems({
        gameId:  refs.games.story_teller,
        levelId: refs.levels[level],
        step,
      });
      if (endItems.length > 0) {
        navigate(buildPracticeUrl({
          level, step, sessionOrder: null,
          itemId: endItems[0].id, batch: 'storyend',
        }));
        return;
      }
    } catch { /* fall through to complete */ }

    navigate(buildCompleteUrl({ level, step }));
  };

  const handleNeedHelp = async () => {
    await logAttempt('need_help');
    setLang('hi_mix');
    setHasStarted(false);
    setShowDecisions(true);
    startedAtRef.current = Date.now();
    clickedRef.current   = false;
    sentenceRefs.current = [];
    setTimeout(() => { setHasStarted(true); audio.play(); }, 120);
  };

  const handleReadAgain = async () => {
    await logAttempt('read_again');
    startedAtRef.current = Date.now();
    clickedRef.current   = false;
    audio.restart();
    setHasStarted(true);
  };

  const handlePlay = () => {
    setHasStarted(true);
    audio.play();
  };

  if (authLoading || loading) return <Shell><Spinner /></Shell>;
  if (fetchError || !sessionRow) return <Shell><FriendlyError message="Couldn't load this story. Please try again." onRetry={() => window.location.reload()} /></Shell>;

  const progressPct  = audio.duration > 0 ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0;
  const remainingSec = audio.duration > 0 ? Math.max(0, Math.ceil((audio.duration - audio.currentTime) / 1000)) : null;

  return (
    <Shell>
      <style>{`
        @keyframes stSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes stFadeIn    { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <Header
        storyName={sessionRow.story_name}
        sessionOrder={sessionOrder}
        totalSessions={totalSessions}
        level={level}
        step={step}
        flow={flow}
        currentIndex={indexOfCurrent(flow.nodes, { sessionOrder })}
      />

      {/* Top control panel: player + speed + (decisions | show-options) */}
      <div className="shrink-0 bg-white border-b border-slate-200">
        <audio ref={audioRef} src={audioUrl ?? undefined} preload="auto" className="hidden" />

        <div className="px-4 pt-3 pb-3">
          {audio.error === 'load_failed' ? (
            <FriendlyError message="Slow internet? Let's try that again." onRetry={audio.manualRetry} />
          ) : (
            <PlayerBar
              isPlaying={audio.isPlaying}
              hasStarted={hasStarted}
              progressPct={progressPct}
              remainingSec={remainingSec}
              speedKey={speedKey}
              onSpeedChange={setSpeedKey}
              onPlay={handlePlay}
              onPause={audio.pause}
              langBadge={lang === 'hi_mix' ? 'Hinglish' : 'English'}
            />
          )}
        </div>

        {audio.hasEnded && !audio.error && (
          showDecisions ? (
            <div className="px-4 pb-3">
              <DecisionButtons
                onUnderstood={handleUnderstood}
                onNeedHelp={handleNeedHelp}
                onReadAgain={handleReadAgain}
                onHide={() => setShowDecisions(false)}
                isHinglish={lang === 'hi_mix'}
                isLastSession={sessionOrder >= totalSessions}
              />
            </div>
          ) : (
            <ShowOptionsBar onShow={() => setShowDecisions(true)} />
          )
        )}
      </div>

      {/* Paragraph text area — scrolls; active sentence auto-centers */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-slate-50">
        <div className="px-5 py-5 max-w-md mx-auto">
          <ParagraphView
            sentences={sentences}
            activeIndex={audio.activeIndex}
            langKey={lang}
            textSize={textSize}
            sentenceRefs={sentenceRefs}
          />
        </div>
      </div>

      {nextAudioUrl ? <audio preload="auto" src={nextAudioUrl} className="hidden" /> : null}

      <BottomBar textSize={textSize} onTextSize={setTextSize} />
    </Shell>
  );
}

// Beefier bottom bar — hosts the text-size chips so the header stays tight.
// Sits below the paragraph scroll area on every session view.
function BottomBar({ textSize, onTextSize }) {
  return (
    <div className="shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center justify-center gap-3">
      <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
        Text size
      </span>
      <TextSizeControl value={textSize} onChange={onTextSize} />
    </div>
  );
}

/* ---------------- helpers ---------------- */

function publicUrl(path) {
  return supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/* ---------------- subcomponents ---------------- */

function Shell({ children }) {
  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {children}
    </div>
  );
}

function Header({ storyName, sessionOrder, totalSessions, level, step, flow, currentIndex }) {
  return (
    <div className="px-4 pt-3 pb-3 flex items-center gap-3 shrink-0 bg-white border-b border-slate-200">
      <BackButton to="/student/games" alwaysUseTo />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="text-[16px] font-black text-slate-900 truncate leading-tight">
          {storyName}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center px-1.5 py-[1px] rounded-md bg-slate-100 text-slate-600 text-[10px] font-black tabular-nums">
            Story {step}
          </span>
          <span className="inline-flex items-center px-1.5 py-[1px] rounded-md bg-rose-50 text-rose-700 text-[10px] font-black tabular-nums">
            Paragraph {sessionOrder} / {totalSessions}
          </span>
        </div>
      </div>
      <STFlowNav
        currentIndex={currentIndex}
        resumeIndex={flow.resumeIndex}
        nodes={flow.nodes}
        level={level}
        step={step}
        nodeToUrl={nodeToUrl}
      />
    </div>
  );
}

function TextSizeControl({ value, onChange }) {
  return (
    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5" aria-label="Text size">
      {TEXT_SIZES.map((size) => {
        const active = value === size;
        return (
          <button
            key={size}
            type="button"
            onClick={() => onChange(size)}
            className={`px-1.5 py-0.5 rounded-md font-black transition ${
              active
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            style={{ fontSize: size === 20 ? '11px' : size === 22 ? '13px' : '15px', lineHeight: 1 }}
            aria-label={`Text size ${size} pixels`}
            aria-pressed={active}
          >
            A
          </button>
        );
      })}
    </div>
  );
}

function ParagraphView({ sentences, activeIndex, langKey, textSize, sentenceRefs }) {
  return (
    <div key={langKey} style={{ animation: 'stFadeIn 250ms ease-out' }} className="flex flex-col gap-3">
      <div
        className="font-medium text-slate-800"
        style={{ fontSize: `${textSize}px`, lineHeight: 1.85 }}
      >
        {sentences.map((s, i) => {
          const isActive = i === activeIndex;
          return (
            <span
              key={i}
              ref={(el) => { sentenceRefs.current[i] = el; }}
              className={
                'transition-colors duration-200 rounded-md px-0.5 ' +
                (isActive
                  ? 'bg-yellow-200/90 text-slate-900'
                  : 'text-slate-600')
              }
            >
              {s.text}{' '}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PlayerBar({
  isPlaying, hasStarted, progressPct, remainingSec,
  speedKey, onSpeedChange, onPlay, onPause, langBadge,
}) {
  const size = 60;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progressPct / 100);
  const showPulse = !hasStarted && !isPlaying;

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {showPulse && (
          <span className="absolute inset-0 rounded-full bg-rose-500 opacity-40 animate-ping" aria-hidden="true" />
        )}
        <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx={size/2} cy={size/2} r={radius}
            stroke="rgb(254 205 211)" strokeWidth={strokeWidth} fill="none" />
          <circle cx={size/2} cy={size/2} r={radius}
            stroke="rgb(225 29 72)" strokeWidth={strokeWidth} fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 150ms linear' }}
          />
        </svg>
        <button
          type="button"
          onClick={isPlaying ? onPause : onPlay}
          className="relative w-full h-full rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md active:scale-95 transition"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="text-[13px] font-black text-slate-800 leading-tight truncate">
            {isPlaying ? 'Listening…' : hasStarted ? 'Paused' : 'Tap ▶ to start'}
          </div>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-wider shrink-0">
            🔊 {langBadge}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-bold text-slate-500 leading-tight truncate">
            {remainingSec != null && isPlaying
              ? `${remainingSec}s left`
              : hasStarted ? 'Tap to continue' : 'Words light up as you listen'}
          </div>
          <SpeedControl value={speedKey} onChange={onSpeedChange} />
        </div>
      </div>
    </div>
  );
}

function SpeedControl({ value, onChange }) {
  return (
    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5 shrink-0" aria-label="Playback speed">
      {SPEEDS.map((s) => {
        const active = value === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums transition ${
              active
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            aria-pressed={active}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function DecisionButtons({ onUnderstood, onNeedHelp, onReadAgain, onHide, isHinglish, isLastSession }) {
  return (
    <div
      className="flex flex-col gap-2 pt-2 border-t border-slate-200"
      style={{ animation: 'stSlideDown 300ms ease-out' }}
    >
      <button
        type="button"
        onClick={onUnderstood}
        className="w-full h-12 rounded-2xl bg-emerald-600 text-white text-[15px] font-black shadow-md hover:bg-emerald-700 active:scale-[0.98] transition flex items-center justify-center gap-2"
      >
        <span>✓</span>
        {isLastSession ? 'I finished the story' : 'I understood, next paragraph'}
      </button>

      {!isHinglish && (
        <button
          type="button"
          onClick={onNeedHelp}
          className="w-full h-11 rounded-2xl bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200 text-[14px] font-extrabold active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          <span>🤝</span> Hinglish mein sunna hai
        </button>
      )}

      <button
        type="button"
        onClick={onReadAgain}
        className="w-full h-11 rounded-2xl bg-slate-50 text-slate-700 ring-1 ring-slate-200 text-[14px] font-extrabold active:scale-[0.98] transition flex items-center justify-center gap-2"
      >
        <span>🔄</span> Read this paragraph again
      </button>

      <button
        type="button"
        onClick={onHide}
        className="w-full h-8 mt-0.5 rounded-xl text-[11px] font-black text-slate-500 hover:text-slate-800 active:scale-[0.98] transition flex items-center justify-center gap-1"
        aria-label="Hide options and read text quietly"
      >
        <span>▲</span> Hide — just let me read
      </button>
    </div>
  );
}

function ShowOptionsBar({ onShow }) {
  return (
    <button
      type="button"
      onClick={onShow}
      className="w-full py-2 border-t border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition flex items-center justify-center gap-1 text-[11px] font-black text-slate-600"
      aria-label="Show options"
    >
      <span>▼</span> Show options
    </button>
  );
}

function FriendlyError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="text-3xl">🐢</div>
      <div className="text-[14px] font-bold text-slate-700 text-center">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="h-11 px-6 rounded-2xl bg-rose-600 text-white text-[14px] font-black shadow-md hover:bg-rose-700 active:scale-[0.98] transition"
      >
        Try Again
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <svg className="animate-spin text-rose-600" width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function PlayIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>;
}
function PauseIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>;
}
