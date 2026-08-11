// STPractice — one practice item at a time.
//
// URL:  /student/games/storyteller/practice?level=&step=&session=&item=&batch=inline|storyend
//
// Flow:
//   1. Fetch the item by id.
//   2. Show prompt → STAudioRecorder → submit → poll → STFeedbackCard.
//   3. On Continue: find next sibling item in the same batch.
//         - if found → navigate to that item
//         - else if batch=inline → navigate to next paragraph
//                  (or to first story-end item if this was the last paragraph)
//         - else (batch=storyend) → navigate to complete
//                  (Phase 2F will inject the bonus Q&A screen here)

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import { getRefs } from '../lib/games/wfRefs.js';
import { submitPracticeAttempt, submitPracticeTyped } from '../lib/games/stAudioUpload.js';
import {
  fetchInlineItems, fetchStoryEndItems, findNextItem,
  buildPracticeUrl, buildSessionUrl, buildCompleteUrl, buildBonusUrl,
} from '../lib/games/stPracticeNav.js';
import STAudioRecorder from '../components/games/st/STAudioRecorder.jsx';
import STFeedbackCard from '../components/games/st/STFeedbackCard.jsx';
import STFlowNav from '../components/games/st/STFlowNav.jsx';
import { getFlow, nodeToUrl, indexOfCurrent } from '../lib/games/stFlow.js';
import BackButton from '../components/BackButton.jsx';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS      = 180000;
const TERMINAL         = ['completed', 'failed', 'no_speech'];

export default function STPractice() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const level         = params.get('level') ?? 'alpha';
  const step          = Number(params.get('step')  ?? 1);
  const sessionOrder  = Number(params.get('session') ?? 0);   // 0 → came from story-end (no paragraph)
  const itemId        = params.get('item');
  const batch         = params.get('batch') ?? 'inline';       // 'inline' | 'storyend'

  const { profile, loading: authLoading } = useAuthProfile('student');

  const [item, setItem]                 = useState(null);
  const [loadError, setLoadError]       = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [attemptId, setAttemptId]       = useState(null);
  const [attempt, setAttempt]           = useState(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [flow, setFlow] = useState({ nodes: [], resumeIndex: 0 });

  // Fetch the item + total sessions in the story (needed for continue logic).
  useEffect(() => {
    if (!profile || !itemId) return;
    // Reset per-item state so item N-1's feedback can't leak onto item N's screen
    // during in-place navigation (navigate with replace:true reuses this component).
    setItem(null);
    setAttempt(null);
    setAttemptId(null);
    setLoadError(null);
    (async () => {
      try {
        const refs = await getRefs();
        const [{ data: itemRow, error: iErr }, { count }, { data: lastAttempt }] = await Promise.all([
          supabase.from('storyteller_practice_items').select('*').eq('id', itemId).single(),
          supabase.from('storyteller_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('game_id', refs.games.story_teller)
            .eq('level_id', refs.levels[level])
            .eq('step', step)
            .eq('is_active', true),
          supabase.from('storyteller_practice_attempts')
            .select('id, attempt_status')
            .eq('practice_item_id', itemId)
            .eq('student_id', profile.id)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (iErr) throw iErr;
        setItem(itemRow);
        setTotalSessions(count ?? 0);
        // Auto-load the most recent attempt for THIS item (of any status).
        // The state reset above prevents item N-1's data from leaking here,
        // so it's safe to surface completed feedback on review, resume a
        // submitted_pending poll, or show the failed state as appropriate.
        // The kid can always tap "Try again" inside STFeedbackCard to record fresh.
        if (lastAttempt) {
          setAttemptId(lastAttempt.id);
        }
      } catch (e) {
        setLoadError(e.message ?? String(e));
      }
    })();
  }, [profile, itemId, level, step]);

  // Load the flow list once per (student, level, step) for the chevron nav.
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
      } catch { /* nav degrades silently */ }
    })();
    return () => { cancelled = true; };
  }, [profile, level, step]);

  // Poll the attempt row after submit.
  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    let recalcTriggered = false;
    const started = Date.now();
    const tick = async () => {
      const { data } = await supabase
        .from('storyteller_practice_attempts')
        .select('*').eq('id', attemptId).single();
      if (cancelled) return;
      setAttempt(data);
      // Snap the leaderboard forward as soon as the kid sees their feedback.
      // The edge fn also fires this server-side (covers when kid has navigated
      // away); this call gives instant UI feedback if they're still on-screen.
      if (data?.attempt_status === 'completed' && !recalcTriggered && profile?.id) {
        recalcTriggered = true;
        supabase.rpc('recalculate_student_scores', { p_student_id: profile.id })
          .then(({ error }) => {
            if (error) console.error('[STPractice] recalc failed:', error);
          });
      }
      if (data && TERMINAL.includes(data.attempt_status)) return;
      if (Date.now() - started >= POLL_MAX_MS) return;
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
    return () => { cancelled = true; };
  }, [attemptId, profile?.id]);

  const handleSubmitAudio = async (payload) => {
    if (!profile || !item) return;
    setSubmitting(true);
    setAttempt(null);
    const { attemptId: id, error: err } = await submitPracticeAttempt({
      studentId: profile.id,
      practiceItemId: item.id,
      blob: payload.blob,
      mimeType: payload.mimeType,
      durationMs: payload.durationMs,
      audioDurationMs: payload.audioDurationMs,
    });
    setSubmitting(false);
    if (err) { setLoadError(err); return; }
    setAttemptId(id);
  };

  const handleSubmitTyped = async ({ transcript, durationMs }) => {
    if (!profile || !item) return;
    setSubmitting(true);
    setAttempt(null);
    const { attemptId: id, error: err } = await submitPracticeTyped({
      studentId: profile.id,
      practiceItemId: item.id,
      transcript, durationMs,
    });
    setSubmitting(false);
    if (err) { setLoadError(err); return; }
    setAttemptId(id);
  };

  const handleRetry = () => {
    // Return to the recorder view for this same item.
    setAttemptId(null);
    setAttempt(null);
  };

  const handleContinue = async () => {
    if (!item) return;
    const refs = await getRefs();

    // Find the next sibling item in this batch.
    const siblings = batch === 'inline'
      ? await fetchInlineItems(item.session_id)
      : await fetchStoryEndItems({
          gameId:  refs.games.story_teller,
          levelId: refs.levels[level],
          step,
        });
    const nextItem = findNextItem(item.id, siblings);
    if (nextItem) {
      navigate(buildPracticeUrl({ level, step, sessionOrder, itemId: nextItem.id, batch }), { replace: true });
      return;
    }

    // Batch exhausted — figure out where to go next.
    if (batch === 'inline') {
      // Advance to next paragraph, or to story-end batch if this was the last paragraph.
      if (sessionOrder < totalSessions) {
        navigate(buildSessionUrl({ level, step, sessionOrder: sessionOrder + 1 }));
        return;
      }
      // Was last paragraph → check story-end items.
      const endItems = await fetchStoryEndItems({
        gameId:  refs.games.story_teller,
        levelId: refs.levels[level],
        step,
      });
      if (endItems.length > 0) {
        navigate(buildPracticeUrl({ level, step, sessionOrder: null, itemId: endItems[0].id, batch: 'storyend' }));
        return;
      }
      navigate(buildCompleteUrl({ level, step }));
      return;
    }

    // batch === 'storyend' — no more items after this. Go to bonus Q&A.
    navigate(buildBonusUrl({ level, step }));
  };

  // Wire the recorder's typed-fallback path.
  const onSubmitAny = (payload) => {
    if (payload?.blob) handleSubmitAudio(payload);
    else if (payload?.transcript) handleSubmitTyped(payload);
  };

  if (authLoading) return <Shell><Spinner /></Shell>;
  if (loadError) return <Shell><ErrorMsg>{loadError}</ErrorMsg></Shell>;
  if (!item) return <Shell><Spinner /></Shell>;

  const beats = Array.isArray(item.content?.beats) ? item.content.beats : [];

  return (
    <Shell>
      <Header
        level={level}
        step={step}
        storyPart={batch === 'inline' ? `After paragraph ${sessionOrder}` : 'Story challenge'}
        flow={flow}
        currentIndex={indexOfCurrent(flow.nodes, { itemId })}
      />

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 max-w-md mx-auto w-full">
        <PromptCard item={item} />

        {!attemptId ? (
          <STAudioRecorder
            durationCapSeconds={item.duration_cap_seconds}
            onSubmit={onSubmitAny}
            submitting={submitting}
          />
        ) : (
          <>
            {!attempt ? <Spinner /> : (
              <STFeedbackCard
                attempt={attempt}
                itemBeats={beats}
                onContinue={handleContinue}
                onRetry={handleRetry}
              />
            )}
          </>
        )}
      </div>

    </Shell>
  );
}

/* ---------------- subcomponents ---------------- */

function Shell({ children }) {
  return <div className="h-full flex flex-col bg-slate-50 overflow-hidden">{children}</div>;
}

function Header({ level, step, storyPart, flow, currentIndex }) {
  return (
    <div className="px-4 pt-3 pb-3 flex items-center gap-3 shrink-0 bg-white border-b border-slate-200">
      <BackButton to="/student/games" alwaysUseTo />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
          Story Teller
        </div>
        <div className="text-[15px] font-black text-slate-900 truncate leading-tight">
          {storyPart}
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

function PromptCard({ item }) {
  const c = item.content ?? {};
  const modeLabel = { question: 'Question', task: 'Task', roleplay: 'Roleplay' }[item.mode] ?? item.mode;
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200 text-[10px] font-black uppercase tracking-wider">
          {modeLabel}
        </span>
        <span className="text-[10px] font-black text-slate-400 tabular-nums">
          up to {item.duration_cap_seconds}s
        </span>
      </div>
      <div className="text-[17px] font-black text-slate-900 leading-snug">
        {c.prompt}
      </div>
      {item.mode === 'roleplay' && (c.scene_setup || c.child_role) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1">
          {c.child_role && (
            <div className="text-[12px] font-semibold text-slate-600">
              <span className="text-slate-400 font-black uppercase tracking-wider text-[10px]">You are:</span>{' '}
              {c.child_role}
            </div>
          )}
          {c.scene_setup && (
            <div className="text-[12px] font-semibold text-slate-600">
              <span className="text-slate-400 font-black uppercase tracking-wider text-[10px]">Scene:</span>{' '}
              {c.scene_setup}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorMsg({ children }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-600 text-[13px]">
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex-1 flex items-center justify-center py-8">
      <svg className="animate-spin text-rose-600" width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
