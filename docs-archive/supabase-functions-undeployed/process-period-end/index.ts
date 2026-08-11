// Period-end seal: turn live ranks into permanent badges.
//
// Weekly  — reads `leaderboard_weekly` (rank<=5) for the period that just ended
//            and increments `badges.weekly_top5` for each winner.
// Monthly — reads `scores` (period_type='monthly') for the month that just
//            ended, computes DENSE_RANK per school in the function (no
//            `leaderboard_monthly` table), takes rank<=5, and increments
//            `badges.monthly_top5`.
//
// Schedule (IST):
//   * Weekly:  every Monday 00:30 IST  -> seals the prior Mon..Sun week.
//   * Monthly: every 1st     00:30 IST -> seals the prior calendar month.
//
// Trigger options:
//   * Supabase scheduled trigger pointing at this function.
//   * `?period=weekly|monthly|both` to force-run one path.
//   * `?period_start=YYYY-MM-DD` to backfill a specific period (the date of
//     that week's Monday or that month's 1st, in IST).
//
// Idempotency: a badge whose `last_earned_at` is already >= the period_start
// being sealed is skipped, so retries / double-cron-fires do not double-count.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TZ = 'Asia/Kolkata';

type IstParts = { y: string; m: string; d: string; wd: number };

function istParts(date: Date): IstParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { y: get('year'), m: get('month'), d: get('day'), wd };
}

// Monday of the IST week containing `date`, as YYYY-MM-DD.
function mondayOfWeekIST(date: Date): string {
  const { y, m, d, wd } = istParts(date);
  const anchor = new Date(`${y}-${m}-${d}T12:00:00Z`);
  const offset = wd === 0 ? -6 : 1 - wd;
  anchor.setUTCDate(anchor.getUTCDate() + offset);
  return anchor.toISOString().slice(0, 10);
}

// First day of the IST month containing `date`, as YYYY-MM-DD.
function firstOfMonthIST(date: Date): string {
  const { y, m } = istParts(date);
  return `${y}-${m}-01`;
}

function addDays(yyyymmdd: string, n: number): string {
  const d = new Date(`${yyyymmdd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function prevMonthFirst(yyyymm01: string): string {
  const d = new Date(`${yyyymm01}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const period = (url.searchParams.get('period') ?? 'auto').toLowerCase();
  const overrideStart = url.searchParams.get('period_start');

  const now = new Date();
  const ist = istParts(now);
  const ran: string[] = [];

  try {
    // ---- WEEKLY -----------------------------------------------------------
    // 'auto' fires only on Monday IST and seals the just-finished week.
    if (period === 'weekly' || period === 'both' ||
        (period === 'auto' && ist.wd === 1)) {
      const target = overrideStart ?? addDays(mondayOfWeekIST(now), -7);
      const summary = await sealWeekly(supabase, target);
      ran.push(`weekly[${target}]: ${summary}`);
    }

    // ---- MONTHLY ----------------------------------------------------------
    // 'auto' fires only on the 1st IST and seals the just-finished month.
    if (period === 'monthly' || period === 'both' ||
        (period === 'auto' && ist.d === '01')) {
      const target = overrideStart ?? prevMonthFirst(firstOfMonthIST(now));
      const summary = await sealMonthly(supabase, target);
      ran.push(`monthly[${target}]: ${summary}`);
    }
  } catch (e) {
    console.error('[process-period-end] failed:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e), ran }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, ran, ist_today: `${ist.y}-${ist.m}-${ist.d}` }),
    { headers: { 'content-type': 'application/json' } },
  );
});

// ----------------------------------------------------------------------------
// Weekly: rank<=5 winners are already pre-computed in leaderboard_weekly by
// the recalculate_student_scores RPC. We just walk and award.
// ----------------------------------------------------------------------------
async function sealWeekly(supabase: any, periodStart: string): Promise<string> {
  const { data: winners, error } = await supabase
    .from('leaderboard_weekly')
    .select('student_id, school_id, rank')
    .eq('period_start', periodStart)
    .lte('rank', 5);
  if (error) throw error;

  let awarded = 0;
  for (const w of winners ?? []) {
    if (await awardBadge(supabase, w.student_id, w.school_id, 'weekly_top5', periodStart)) {
      awarded++;
    }
  }
  return `winners=${(winners ?? []).length} awarded=${awarded}`;
}

// ----------------------------------------------------------------------------
// Monthly: read the monthly scores rollup, DENSE_RANK in JS per school,
// award rank<=5. (leaderboard_monthly table no longer exists.)
// ----------------------------------------------------------------------------
async function sealMonthly(supabase: any, periodStart: string): Promise<string> {
  const { data: rows, error } = await supabase
    .from('scores')
    .select('student_id, school_id, total_score')
    .eq('period_type', 'monthly')
    .eq('period_start', periodStart);
  if (error) throw error;

  const bySchool = new Map<string, { student_id: string; total_score: number }[]>();
  for (const r of rows ?? []) {
    const list = bySchool.get(r.school_id) ?? [];
    list.push({ student_id: r.student_id, total_score: r.total_score });
    bySchool.set(r.school_id, list);
  }

  let winnerCount = 0;
  let awarded = 0;
  for (const [schoolId, schoolRows] of bySchool) {
    schoolRows.sort((a, b) => b.total_score - a.total_score);
    let rank = 0;
    let prevScore = Number.NaN;
    for (const r of schoolRows) {
      if (r.total_score !== prevScore) {
        rank += 1; // DENSE_RANK: gap-less
        prevScore = r.total_score;
      }
      if (rank > 5) break;
      winnerCount++;
      if (await awardBadge(supabase, r.student_id, schoolId, 'monthly_top5', periodStart)) {
        awarded++;
      }
    }
  }
  return `winners=${winnerCount} awarded=${awarded}`;
}

// ----------------------------------------------------------------------------
// Idempotent badge increment.
// `badges` is unique on (student_id, badge_type) — count is cumulative.
// We compare last_earned_at against the period_start being sealed: if a badge
// was last earned at-or-after that period start, this period was already
// awarded and we skip. Retries and double cron-fires become no-ops.
// ----------------------------------------------------------------------------
async function awardBadge(
  supabase: any,
  studentId: string,
  schoolId: string,
  badgeType: 'weekly_top5' | 'monthly_top5',
  periodStart: string,
): Promise<boolean> {
  const periodStartTs = new Date(`${periodStart}T00:00:00Z`).toISOString();

  const { data: existing, error: selErr } = await supabase
    .from('badges')
    .select('id, count, last_earned_at')
    .eq('student_id', studentId)
    .eq('badge_type', badgeType)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    if (existing.last_earned_at && existing.last_earned_at >= periodStartTs) {
      return false;
    }
    const { error: updErr } = await supabase
      .from('badges')
      .update({
        count: (existing.count ?? 0) + 1,
        last_earned_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (updErr) throw updErr;
    return true;
  }

  const { error: insErr } = await supabase.from('badges').insert({
    student_id: studentId,
    school_id:  schoolId,
    badge_type: badgeType,
    count: 1,
    last_earned_at: new Date().toISOString(),
  });
  if (insErr) throw insErr;
  return true;
}
