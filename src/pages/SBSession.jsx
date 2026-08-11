// Sentence Builder — unified single-page game shell.
// Manages the placement state, scoring, and DB hooks.
// Defers rendering to specific Variant bodies (Narrate, Flash, Recast).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import { useSbSession } from '../lib/games/useSbSession.js';
import { sbScoring } from '../lib/games/sbScoring.js';
import { sbComplete } from '../lib/games/sbComplete.js';
import { loadSbProgress } from '../lib/games/sbProgress.js';
import BackButton from '../components/BackButton.jsx';

import NarrateBody from '../components/games/sb/NarrateBody.jsx';
import FlashBody from '../components/games/sb/FlashBody.jsx';
import RecastBody from '../components/games/sb/RecastBody.jsx';
import SBOutcome from '../components/games/sb/SBOutcome.jsx';
import HintSheet from '../components/games/HintSheet.jsx';
// import SBOutcome from '../components/games/sb/SBOutcome.jsx';

export default function SBSession() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const level = params.get('level') ?? 'alpha';
  const requestedStep = Number(params.get('step') ?? localStorage.getItem('sb_last_step') ?? 1);
  const [step, setStep] = useState(requestedStep);

  const { profile, loading: authLoading } = useAuthProfile('student');
  const {
    session, character, status: sessionStatus, error: sessionError, refetch: refetchSession,
  } = useSbSession({ studentId: profile?.id, level, step });

  const [phase, setPhase] = useState('play'); // 'play' | 'outcome'
  const [placements, setPlacements] = useState([]); // array of string|null
  const [scoring, setScoring] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null); // seconds; null = no timer

  const [showHintSheet, setShowHintSheet] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showStepPicker, setShowStepPicker] = useState(false);

  const [levelProgress, setLevelProgress] = useState({ started: 0, completed: 0, total: 10, stepsMeta: [] });
  const [pointsTotal, setPointsTotal] = useState(0);
  const startedAtRef = useRef(Date.now());

  const currentStepMeta = useMemo(() => {
    return levelProgress.stepsMeta.find((s) => s.step === step);
  }, [levelProgress.stepsMeta, step]);

  const sessionsDone = currentStepMeta?.done || 0;
  const sessionsTotal = currentStepMeta?.total || 1;
  const sessionProgressPercent = currentStepMeta?.total > 0 ? (sessionsDone / sessionsTotal) * 100 : 0;

  // Refs used by aborted-writer so the effect can stay lean and not re-fire on every tap.
  const abortedRef = useRef({ phase, session, profile, placements, level });
  abortedRef.current = { phase, session, profile, placements, level };

  // Keep URL and localStorage in sync with current step
  useEffect(() => {
    localStorage.setItem('sb_last_step', String(step));
    if (Number(params.get('step')) !== step) {
      setParams({ step: String(step) }, { replace: true });
    }
  }, [step, setParams, params]);

  // Reset play state whenever a new session loads
  useEffect(() => {
    if (!session) return;
    const slotCount = session.layout.filter((c) => c.type === 'slot').length;
    setPlacements(Array(slotCount).fill(null));
    setScoring(null);
    setPhase('play');
    setShowHintSheet(false);
    startedAtRef.current = Date.now();
    // Per PRD §3.8: intro shows on session_order=1 iff the author populated session_intro
    // AND the kid hasn't dismissed it for this (level, step).
    const introKey = `sb_intro_${level}_${step}`;
    const shouldShowIntro = session.session_order === 1
      && !!session.session_intro
      && !localStorage.getItem(introKey);
    setShowOnboarding(shouldShowIntro);
    // Init timer per session.time_limit_seconds (Alpha default 180)
    setTimeLeft(session.time_limit_seconds ?? null);
  }, [session?.id, session?.layout, level, step, session?.session_order, session?.session_intro, session?.time_limit_seconds]);

  // Aborted-attempt writer if kid leaves mid-play.
  // Deps intentionally minimal: cleanup should fire only when session or phase changes,
  // NOT on every placement tap. Latest state is read via abortedRef.
  useEffect(() => {
    return () => {
      const s = abortedRef.current;
      if (s.phase === 'play' && s.session && s.profile && s.placements.some((p) => p !== null)) {
        sbComplete({
          studentId: s.profile.id,
          sessionId: s.session.id,
          level: s.level,
          placedTiles: s.placements,
          scoring: {
            score: 0, is_correct: false,
            correct_placements_count: 0,
            wrong_placements_count: s.placements.filter(Boolean).length,
          },
          durationMs: Date.now() - startedAtRef.current,
          attemptStatus: 'aborted',
        }).catch(() => {});
      }
    };
  }, [phase, session?.id]);

  // Load level progress + points total
  useEffect(() => {
    if (!profile) return;
    loadSbProgress(profile.id, level).then((res) => {
      setLevelProgress(res);
      // Auto-route to frontierStep only when the URL has no explicit step.
      // If the kid explicitly navigated to a done step, respect that choice —
      // the exhausted screen will show and they can pick another step.
      if (!params.get('step')) {
        const nextStep = res.frontierStep;
        if (nextStep && nextStep !== step) {
          setStep(nextStep);
        }
      }
    });
    loadPointsTotal(profile.id).then(setPointsTotal);
  }, [profile, phase, level, params, step]);

  const handlePlace = (chipId) => {
    setPlacements((prev) => {
      const idx = prev.findIndex((p) => p === null);
      if (idx === -1) return prev; // no empty slots
      const next = [...prev];
      next[idx] = chipId;
      return next;
    });
  };

  const handleUndo = (slotIndex) => {
    setPlacements((prev) => {
      if (prev[slotIndex] === null) return prev;
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  };

  const handleOpenHint = () => setShowHintSheet(true);

  const finishSession = async (attemptStatus) => {
    if (submitting || !session) return;
    setSubmitting(true);
    const durationMs = Date.now() - startedAtRef.current;

    const s = sbScoring(placements, session.layout, session.valid_sentences);
    setScoring(s);

    try {
      await sbComplete({
        studentId: profile.id,
        sessionId: session.id,
        level,
        placedTiles: placements,
        scoring: s,
        durationMs,
        attemptStatus,
      });
      loadPointsTotal(profile.id).then(setPointsTotal);
      loadSbProgress(profile.id, level).then(setLevelProgress);
    } catch (e) {
      console.error('[sbComplete]', e);
    }
    setPhase('outcome');
    setSubmitting(false);
  };

  const handleDone = () => finishSession('completed');

  // Per-session countdown timer (session.time_limit_seconds; Alpha default 180).
  // On expire → auto-finish with attempt_status='timeout'.
  useEffect(() => {
    if (phase !== 'play' || timeLeft === null || timeLeft <= 0) return;
    if (!session) return;
    const t = setTimeout(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null;
        const next = prev - 1;
        if (next <= 0) {
          finishSession('timeout');
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase, session?.id]);

  const handleNextSession = () => {
    setPhase('play');
    refetchSession();
  };

  const handlePickStep = (newStep) => {
    setShowStepPicker(false);
    if (newStep === step) {
      refetchSession();
      setPhase('play');
    } else {
      setStep(newStep);
    }
  };

  if (authLoading) return <FullPageSpinner />;

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      {/* Header row 1: back / title / points */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2 shrink-0">
        <BackButton to="/student/games/sentence-builder" />
        <div className="flex-1 min-w-0 text-center">
          <div className="text-[13px] font-black text-slate-900 leading-tight truncate capitalize">
            {session?.story_name || 'Sentence Builder'}
          </div>
        </div>
        <div className="inline-flex items-center gap-1 shrink-0 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200">
          <span className="text-[11px]">⚡</span>
          <span className="text-[11px] font-black tabular-nums">{pointsTotal}</span>
        </div>
      </div>

      {/* Header row 2: session progress bar + timer + step chip */}
      <div className="px-4 pb-2 flex items-center gap-2 shrink-0">
        <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-500"
            style={{ width: `${sessionProgressPercent}%` }}
          />
        </div>
        <span className="text-[11px] font-extrabold text-slate-500 shrink-0 tabular-nums">
          {sessionsDone}/{sessionsTotal === 1 && currentStepMeta?.total === 0 ? 0 : sessionsTotal}
        </span>
        {timeLeft !== null && phase === 'play' && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 text-[11px] font-extrabold shrink-0 tabular-nums ${
            timeLeft <= 30 ? 'bg-rose-50 ring-rose-200 text-rose-700' : 'bg-slate-50 ring-slate-200 text-slate-600'
          }`}>
            ⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowStepPicker(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 ring-1 ring-indigo-200 text-indigo-700 text-[11px] font-extrabold shrink-0 active:scale-[0.98] transition"
        >
          Step {step} <span className="text-[9px]">▾</span>
        </button>
      </div>

      <div className="border-t border-slate-200 shrink-0" />

      {/* Body */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {sessionStatus === 'loading' && <FullPageSpinner />}
        {sessionStatus === 'error' && <ErrorInline message={sessionError} />}
        {sessionStatus === 'exhausted' && (
          <ExhaustedInline
            step={step}
            onDifferentStep={() => setShowStepPicker(true)}
          />
        )}
        
        {sessionStatus === 'ready' && session && phase === 'play' && (
          <div className="flex-1 flex flex-col min-h-0 px-4 pt-3 pb-3">
            {(session.mechanic === 'narrate' || session.mechanic === 'grow') && (
              <NarrateBody
                session={session}
                placements={placements}
                onPlace={handlePlace}
                onUndo={handleUndo}
                disabled={submitting}
                onOpenHint={handleOpenHint}
              />
            )}
            {session.mechanic === 'flash' && (
              <FlashBody
                session={session}
                placements={placements}
                onPlace={handlePlace}
                onUndo={handleUndo}
                disabled={submitting}
                onOpenHint={handleOpenHint}
              />
            )}
            {session.mechanic === 'recast' && (
              <RecastBody
                session={session}
                character={character}
                placements={placements}
                onPlace={handlePlace}
                onUndo={handleUndo}
                disabled={submitting}
                onOpenHint={handleOpenHint}
              />
            )}

            <button
              type="button"
              onClick={handleDone}
              disabled={submitting || placements.some((p) => p === null)} // require all slots filled
              className="mt-3 w-full h-13 min-h-[52px] rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[15px] font-black shadow-md active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100 shrink-0"
            >
              {submitting ? 'Checking…' : 'Done'}
            </button>
          </div>
        )}

        {sessionStatus === 'ready' && session && phase === 'outcome' && scoring && (
          <div className="flex-1 flex flex-col min-h-0 px-4 pt-3 pb-3">
            <SBOutcome
              session={session}
              placements={placements}
              scoring={scoring}
              onNextNow={handleNextSession}
              paused={false}
            />
          </div>
        )}
      </div>

      {/* Overlays */}
      {showOnboarding && session && (
        <OnboardingOverlay
          introText={session.session_intro}
          onDismiss={() => {
            localStorage.setItem(`sb_intro_${level}_${step}`, '1');
            setShowOnboarding(false);
          }}
        />
      )}
      {showStepPicker && (
        <StepPickerSheet
          currentStep={step}
          stepsMeta={levelProgress.stepsMeta}
          onPick={handlePickStep}
          onClose={() => setShowStepPicker(false)}
        />
      )}
      <HintSheet
        open={showHintSheet}
        onClose={() => setShowHintSheet(false)}
        hints={session ? [session.hint_1, session.hint_2] : []}
        progressive
      />
    </div>
  );
}

/* ---------------- Overlays ---------------- */

function OnboardingOverlay({ introText, onDismiss }) {
  // introText may contain English + Hindi separated by newline (per PRD §3.8). Render as-is.
  return (
    <div className="absolute inset-0 z-30 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-6 max-w-[320px] shadow-2xl">
        <div className="text-center text-4xl mb-2">👋</div>
        <h3 className="text-[18px] font-black text-slate-900 text-center">How to play this step</h3>
        {introText ? (
          <p className="mt-4 text-[13px] font-semibold text-slate-700 whitespace-pre-line text-center">
            {introText}
          </p>
        ) : (
          <ul className="mt-4 space-y-3 text-[13px] font-semibold text-slate-700">
            <li className="flex items-start gap-3">
              <span className="text-xl">👆</span>
              <span>Tap words to fill the blanks.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-xl">↩️</span>
              <span>Tap a filled word to remove it.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-xl">✅</span>
              <span>Press <b>Done</b> when your sentence is complete.</span>
            </li>
          </ul>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 w-full h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[14px] font-black active:scale-[0.98] transition"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}

function StepPickerSheet({ currentStep, stepsMeta, onPick, onClose }) {
  return (
    <div className="absolute inset-0 z-30 bg-slate-900/50 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-3xl p-5 shadow-2xl max-h-[80%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-3" />
        <h3 className="text-[15px] font-black text-slate-900 text-center">Pick a step</h3>
        <p className="mt-1 text-[11.5px] font-semibold text-slate-500 text-center">
          Play any step, any time.
        </p>

        <div className="mt-4 grid grid-cols-5 gap-2">
          {stepsMeta.map((s) => {
            const active = s.step === currentStep;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => onPick(s.step)}
                className={`
                  aspect-square rounded-2xl ring-1 flex flex-col items-center justify-center gap-0.5
                  active:scale-[0.97] transition
                  ${active
                    ? 'bg-indigo-500 ring-indigo-400 text-white shadow-md'
                    : 'bg-white ring-slate-200 text-slate-800'}
                `}
              >
                <div className="text-[18px] font-black leading-none">{s.step}</div>
                <div className={`text-[9px] font-extrabold leading-none ${active ? 'text-white/90' : 'text-emerald-600'}`}>
                  {s.isComplete ? '✓' : '▶'}
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full h-11 rounded-xl bg-slate-100 text-slate-600 text-[12.5px] font-extrabold active:scale-[0.98] transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ExhaustedInline({ step, onDifferentStep }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-4">
      <div className="text-5xl">🎉</div>
      <h2 className="text-[18px] font-black text-slate-900">Step {step} Complete!</h2>
      <p className="max-w-[260px] text-[12.5px] font-semibold text-slate-600">
        You've finished all sessions in this step.
      </p>
      <button
        type="button"
        onClick={onDifferentStep}
        className="mt-2 h-11 px-5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[13px] font-black active:scale-[0.98] transition"
      >
        Go to next step
      </button>
    </div>
  );
}

function ErrorInline({ message }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
      <div className="text-4xl">😵</div>
      <p className="text-[13px] font-semibold text-rose-700">{message ?? 'Something went wrong.'}</p>
    </div>
  );
}

function FullPageSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <svg className="animate-spin text-indigo-600" width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ---------------- Data helpers ---------------- */

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
