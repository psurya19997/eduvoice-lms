// Word Family — unified single-page game.
// Two phases only: 'play' and 'outcome'. No navigation between phases.
// Everything fits the 400×812 phone viewport without scroll.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import { useWfSession } from '../lib/games/useWfSession.js';
import { wfScoring } from '../lib/games/wfScoring.js';
import { wfComplete } from '../lib/games/wfComplete.js';
import { getRefs } from '../lib/games/wfRefs.js';
import { loadWfProgress } from '../lib/games/wfProgress.js';
import BackButton from '../components/BackButton.jsx';
import BubblePlayBody from '../components/games/BubblePlayBody.jsx';
import FrozenBubbles from '../components/games/FrozenBubbles.jsx';
import HintSheet from '../components/games/HintSheet.jsx';

const ONBOARDED_KEY = 'wf_onboarded_v1';

export default function WFSession() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const level = params.get('level') ?? 'alpha';
  const requestedStep = Number(params.get('step') ?? localStorage.getItem('wf_last_step') ?? 1);
  const [step, setStep] = useState(requestedStep);

  const { profile, loading: authLoading } = useAuthProfile('student');
  const {
    session, status: sessionStatus, error: sessionError, refetch: refetchSession,
  } = useWfSession({ studentId: profile?.id, level, step });

  const [phase, setPhase] = useState('play'); // 'play' | 'outcome'
  const [picks, setPicks] = useState([]);
  const [scoring, setScoring] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHintSheet, setShowHintSheet] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showStepPicker, setShowStepPicker] = useState(false);
  const [levelProgress, setLevelProgress] = useState({ started: 0, total: 10, stepsMeta: [] });
  const [pointsTotal, setPointsTotal] = useState(0);
  const startedAtRef = useRef(Date.now());
  const bubblePlayBodyRef = useRef(null);
  const bubbleSnapshotRef = useRef(null);

  const currentStepMeta = useMemo(() => {
    return levelProgress.stepsMeta.find((s) => s.step === step);
  }, [levelProgress.stepsMeta, step]);

  const sessionsDone = currentStepMeta?.done || 0;
  const sessionsTotal = currentStepMeta?.total || 1;
  const sessionProgressPercent = currentStepMeta?.total > 0 ? (sessionsDone / sessionsTotal) * 100 : 0;

  // Snapshot ref used by the unmount-only aborted-writer so it reads the LATEST
  // state instead of a stale closure. Updated every render.
  const abortSnapshotRef = useRef({ phase, session, profile, picks, level });
  abortSnapshotRef.current = { phase, session, profile, picks, level };

  // Keep URL and localStorage in sync with current step
  useEffect(() => {
    localStorage.setItem('wf_last_step', String(step));
    if (Number(params.get('step')) !== step) {
      setParams({ step: String(step) }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Reset play state whenever a new session loads
  useEffect(() => {
    if (!session) return;
    setPicks([]);
    setScoring(null);
    setPhase('play');
    setShowHintSheet(false);
    startedAtRef.current = Date.now();
    if (!localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true);
  }, [session?.id]);

  // Aborted-attempt writer. Fires ONLY on component unmount so the normal
  // play → outcome → next-session flow doesn't leak spurious aborted rows.
  // Reads latest state via ref.
  useEffect(() => {
    return () => {
      const s = abortSnapshotRef.current;
      if (s.phase === 'play' && s.session && s.profile && s.picks.length > 0) {
        wfComplete({
          studentId: s.profile.id,
          sessionId: s.session.id,
          level: s.level,
          picks: s.picks,
          scoring: {
            score: 0, is_correct: false,
            correct_picks_count: 0,
            wrong_picks_count: s.picks.length,
            total_targets: s.session.words.filter((w) => w.is_target).length,
          },
          durationMs: Date.now() - startedAtRef.current,
          attemptStatus: 'aborted',
        }).catch(() => {});
      }
    };
  }, []);

  // Load level progress + points total
  useEffect(() => {
    if (!profile) return;
    loadWfProgress(profile.id, level).then((res) => {
      setLevelProgress(res);
      // Auto-route to frontierStep only when the URL has no explicit step.
      // If the kid explicitly navigated to a resting step, respect that choice —
      // the exhausted screen shows and they can pick another step.
      if (!params.get('step')) {
        const nextStep = res.frontierStep;
        if (nextStep && nextStep !== step) {
          setStep(nextStep);
        }
      }
    });
    loadPointsTotal(profile.id).then(setPointsTotal);
  }, [profile, phase, level]);

  const targetCount = useMemo(
    () => session ? session.words.filter((w) => w.is_target).length : 0,
    [session],
  );

  const togglePick = (word) => {
    setPicks((prev) => prev.includes(word) ? prev.filter((p) => p !== word) : [...prev, word]);
  };

  const handleDone = async () => {
    if (submitting || !session) return;
    // Freeze physics BEFORE the network wait so the outcome view sees a true
    // freeze-frame (see 08-word-family-bubble-mode.md → Done handoff sequence).
    bubblePlayBodyRef.current?.freezeAll();
    setSubmitting(true);
    const durationMs = Date.now() - startedAtRef.current;
    const s = wfScoring(picks, session.words);
    setScoring(s);
    try {
      await wfComplete({
        studentId: profile.id,
        sessionId: session.id,
        level,
        picks,
        scoring: s,
        durationMs,
        attemptStatus: 'completed',
      });
      // Refresh stats
      loadPointsTotal(profile.id).then(setPointsTotal);
      loadWfProgress(profile.id, level).then(setLevelProgress);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[wfComplete]', e);
    }
    bubbleSnapshotRef.current = bubblePlayBodyRef.current?.snapshot() ?? null;
    setPhase('outcome');
    setSubmitting(false);
  };

  const handleNextSession = () => {
    setPhase('play');
    refetchSession();
  };

  const handlePickStep = (newStep) => {
    setShowStepPicker(false);
    if (newStep === step) {
      // Force a fresh session even if step didn't change
      refetchSession();
      setPhase('play');
    } else {
      setStep(newStep);
    }
  };

  if (authLoading) return <FullPageSpinner />;

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      {/* Header row 1: back / title / points / streak */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2 shrink-0">
        <BackButton to="/student/games/word-family" />
        <div className="flex-1 min-w-0 text-center">
          <div className="text-[13px] font-black text-slate-900 leading-tight truncate capitalize">
            Word Family · {level}
          </div>
        </div>
        <div className="inline-flex items-center gap-1 shrink-0 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200">
          <span className="text-[11px]">⚡</span>
          <span className="text-[11px] font-black tabular-nums">{pointsTotal}</span>
        </div>
      </div>

      {/* Header row 2: session progress bar + step chip */}
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
      <div className="flex-1 flex flex-col min-h-0 px-4 pt-3 pb-3">
        {sessionStatus === 'loading' && <FullPageSpinner />}
        {sessionStatus === 'error' && <ErrorInline message={sessionError} />}
        {sessionStatus === 'exhausted' && (() => {
          const meta = levelProgress.stepsMeta.find((s) => s.step === step);
          const isEmptyStep = !meta || meta.total === 0;
          const nextStep = levelProgress.stepsMeta.find((s) => s.step > step && s.total > 0 && !s.isComplete);
          const onGoNext = nextStep ? () => setStep(nextStep.step) : null;
          return isEmptyStep ? (
            <ExhaustedInline
              step={step}
              onDifferentStep={() => setShowStepPicker(true)}
            />
          ) : (
            <StepCompleteInline
              step={step}
              onGoNext={onGoNext}
              onDifferentStep={() => setShowStepPicker(true)}
            />
          );
        })()}
        {sessionStatus === 'ready' && session && phase === 'play' && (
          <BubblePlayBody
            key={session.id}
            ref={bubblePlayBodyRef}
            session={session}
            targetCount={targetCount}
            picks={picks}
            onToggle={togglePick}
            onDone={handleDone}
            submitting={submitting}
            onOpenHint={() => setShowHintSheet(true)}
          />
        )}
        {sessionStatus === 'ready' && session && phase === 'outcome' && scoring && (
          <OutcomeBody
            session={session}
            picks={picks}
            scoring={scoring}
            onNextNow={handleNextSession}
            paused={false}
            snapshot={bubbleSnapshotRef.current}
          />
        )}
      </div>

      {/* Overlays */}
      {showOnboarding && (
        <OnboardingOverlay onDismiss={() => {
          localStorage.setItem(ONBOARDED_KEY, '1');
          setShowOnboarding(false);
        }} />
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
        hints={session ? [session.hint] : []}
      />
    </div>
  );
}

/* ---------------- Bodies ---------------- */

function OutcomeBody({ session, picks, scoring, onNextNow, paused, snapshot }) {
  const initialSeconds = scoring.is_correct ? 5 : 15;
  const [countdown, setCountdown] = useState(initialSeconds);
  const [isPaused, setIsPaused] = useState(paused);

  useEffect(() => {
    if (isPaused || paused) return;
    if (countdown <= 0) { onNextNow(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, isPaused, paused, onNextNow]);

  const bubbleStates = {};
  const wrongPicks = [];
  const missedTargets = [];
  const pickSet = new Set(picks);
  for (const w of session.words) {
    if (pickSet.has(w.word)) {
      if (w.is_target) bubbleStates[w.word] = 'correct';
      else { bubbleStates[w.word] = 'wrong'; wrongPicks.push(w); }
    } else if (w.is_target) {
      bubbleStates[w.word] = 'missed';
      missedTargets.push(w);
    } else {
      bubbleStates[w.word] = 'idle';
    }
  }

  const points = scoring.is_correct ? 5 : 3;
  const headline =
    scoring.is_correct ? 'Perfect! 🌟' :
    scoring.score >= 50 ? `Great try! ${scoring.correct_picks_count}/${scoring.total_targets}` :
    'Nice try 🌱';
  const headlineColor =
    scoring.is_correct ? 'text-emerald-700' :
    scoring.score >= 50 ? 'text-indigo-700' : 'text-amber-700';

  const totalTargets = scoring.total_targets;

  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold text-slate-900 leading-tight">
            {session.category_name}
          </div>
          <div className={`mt-1 text-[16px] font-black leading-tight ${headlineColor}`}>{headline}</div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2.5 py-1 shrink-0">
          <span className="text-[12px]">⚡</span>
          <span className="text-[12px] font-black text-amber-700">+{points}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <FrozenBubbles snapshot={snapshot} states={bubbleStates} words={session.words} />

        {(wrongPicks.length > 0 || missedTargets.length > 0) && (
          <div className="mt-3 flex flex-col gap-1.5">
            {wrongPicks.length > 0 && (
              <div className="text-[10.5px] font-black text-amber-700 uppercase tracking-wide mt-0.5">
                Didn't fit ({wrongPicks.length})
              </div>
            )}
            {wrongPicks.map((w) => (
              <div key={`w-${w.word}`} className="text-[11.5px] font-semibold text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-2.5 py-1.5">
                {w.emoji ?? '❔'} <b>{w.word}</b> — didn't fit here.
              </div>
            ))}
            {missedTargets.length > 0 && (
              <div className="text-[10.5px] font-black text-sky-700 uppercase tracking-wide mt-0.5">
                You missed ({missedTargets.length} of {totalTargets})
              </div>
            )}
            {missedTargets.map((w) => (
              <div key={`m-${w.word}`} className="text-[11.5px] font-semibold text-sky-800 bg-sky-50 ring-1 ring-sky-200 rounded-lg px-2.5 py-1.5">
                {w.emoji ?? '❔'} <b>{w.word}</b> — this was an answer.
              </div>
            ))}
          </div>
        )}

      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={onNextNow}
          className="h-12 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[14px] font-black shadow-md active:scale-[0.98] transition"
        >
          Next now →
        </button>
        <button
          type="button"
          onClick={() => setIsPaused((p) => !p)}
          className={`h-12 px-3 rounded-2xl ring-1 text-[12px] font-extrabold tabular-nums active:scale-[0.98] transition ${
            isPaused
              ? 'bg-white ring-slate-200 text-slate-600'
              : 'bg-slate-100 ring-slate-200 text-slate-700'
          }`}
        >
          {isPaused ? 'Paused ▶' : `Auto ${countdown}s ⏸`}
        </button>
      </div>
    </>
  );
}

/* ---------------- Overlays ---------------- */

function OnboardingOverlay({ onDismiss }) {
  return (
    <div className="absolute inset-0 z-30 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-6 max-w-[320px] shadow-2xl">
        <div className="text-center text-4xl mb-2">👋</div>
        <h3 className="text-[18px] font-black text-slate-900 text-center">How to play</h3>
        <ul className="mt-4 space-y-3 text-[13px] font-semibold text-slate-700">
          <li className="flex items-start gap-3">
            <span className="text-xl">👆</span>
            <span>Tap tiles to pick. Tap again to un-pick.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-xl">🇮🇳</span>
            <span>Long-press any tile to see its Hindi word.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-xl">✅</span>
            <span>Press <b>Done</b> when you're ready.</span>
          </li>
        </ul>
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
                  ▶
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
      <div className="text-5xl">📭</div>
      <h2 className="text-[18px] font-black text-slate-900">No sessions in Step {step}</h2>
      <p className="max-w-[260px] text-[12.5px] font-semibold text-slate-600">
        This step doesn't have any sessions yet. Pick a different step and keep going.
      </p>
      <button
        type="button"
        onClick={onDifferentStep}
        className="mt-2 h-11 px-5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[13px] font-black active:scale-[0.98] transition"
      >
        Try a different step
      </button>
    </div>
  );
}

function StepCompleteInline({ step, onGoNext, onDifferentStep }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-4">
      <div className="text-5xl">🎉</div>
      <h2 className="text-[18px] font-black text-slate-900">Step {step} Complete!</h2>
      <p className="max-w-[260px] text-[12.5px] font-semibold text-slate-600">
        You've finished all sessions in this step.
      </p>
      {onGoNext ? (
        <button
          type="button"
          onClick={onGoNext}
          className="mt-2 h-11 px-5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[13px] font-black active:scale-[0.98] transition"
        >
          Go to next step
        </button>
      ) : (
        <button
          type="button"
          onClick={onDifferentStep}
          className="mt-2 h-11 px-5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[13px] font-black active:scale-[0.98] transition"
        >
          Try a different step
        </button>
      )}
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

