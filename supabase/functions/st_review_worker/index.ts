// st_review_worker — periodic backend sweep for stuck practice attempts.
//
// Fired by pg_cron every 10 minutes. Finds practice attempts that are still
// pending or previously failed AND haven't exhausted their retry budget, then
// re-invokes st_review_recording for each in a bounded batch (max 20 per run
// so a big backlog doesn't lock things up).
//
// Uses service role. Never called from the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_TOTAL_ATTEMPTS = 8;      // 3 inline + 5 backend
const BATCH_SIZE         = 20;
const RETRY_AGE_MINUTES  = 10;

Deno.serve(async (_req) => {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  // Pick rows to retry: pending or previously failed, still under budget,
  // and stale enough that a retry has any chance of helping.
  const staleCutoff = new Date(Date.now() - RETRY_AGE_MINUTES * 60 * 1000).toISOString();
  
  // 1. Practice Attempts
  const { data: practiceRows, error: pErr } = await sb
    .from('storyteller_practice_attempts')
    .select('id, gemini_attempts, submitted_at')
    .in('attempt_status', ['submitted_pending', 'failed'])
    .lt('gemini_attempts', MAX_TOTAL_ATTEMPTS)
    .lt('submitted_at', staleCutoff)
    .order('submitted_at', { ascending: true })
    .limit(BATCH_SIZE);
  if (pErr) return jsonError(500, `select_failed_practice: ${pErr.message}`);

  // 2. Bonus Attempts
  const { data: bonusRows, error: bErr } = await sb
    .from('storyteller_bonus_attempts')
    .select('id, analysis_attempts, ended_at')
    .in('analysis_status', ['pending', 'failed'])
    .lt('analysis_attempts', MAX_TOTAL_ATTEMPTS)
    .lt('ended_at', staleCutoff)
    .order('ended_at', { ascending: true })
    .limit(BATCH_SIZE);
  if (bErr) return jsonError(500, `select_failed_bonus: ${bErr.message}`);

  if ((!practiceRows || practiceRows.length === 0) && (!bonusRows || bonusRows.length === 0)) {
    return jsonOk({ ok: true, retried_practice: 0, retried_bonus: 0 });
  }

  // Fire them off. We don't await sequentially — invoke in parallel with a small
  // safety cap; each call is bounded by its own inline-retry policy.
  const practiceResults = await Promise.all((practiceRows || []).map(async (r) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/st_review_recording`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attempt_id: r.id }),
      });
      return { id: r.id, http: res.status };
    } catch (e) {
      return { id: r.id, error: (e as Error).message };
    }
  }));

  const bonusResults = await Promise.all((bonusRows || []).map(async (r) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/st_bonus_analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attempt_id: r.id }),
      });
      return { id: r.id, http: res.status };
    } catch (e) {
      return { id: r.id, error: (e as Error).message };
    }
  }));

  return jsonOk({ 
    ok: true, 
    retried_practice: practiceRows?.length || 0, 
    retried_bonus: bonusRows?.length || 0,
    practiceResults,
    bonusResults
  });
});

function jsonOk(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
