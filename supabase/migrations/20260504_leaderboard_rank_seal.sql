-- ============================================================================
-- 20260504_leaderboard_rank_seal.sql
--
-- Moves weekly-leaderboard ranking out of the React client and into Postgres.
-- Adds a helper that recomputes DENSE_RANK over `public.scores` for one
-- (school_id, period_start) and upserts the result into `public.leaderboard_weekly`.
--
-- Ties: DENSE_RANK is intentional — multiple students can share rank #1 and
--       all earn the weekly_top5 badge.
--
-- Timezone: this helper is TZ-agnostic. It trusts whatever `period_start`
--           value `recalculate_student_scores` already passes in (which is
--           computed in IST upstream).
-- ============================================================================

create or replace function public.update_leaderboard_weekly_ranks(
  p_school_id    uuid,
  p_period_start date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ranked as (
    select
      s.student_id,
      s.school_id,
      s.period_start,
      s.total_score,
      dense_rank() over (
        partition by s.school_id, s.period_start
        order by s.total_score desc
      ) as rank
    from public.scores s
    where s.school_id    = p_school_id
      and s.period_type  = 'weekly'
      and s.period_start = p_period_start
  )
  insert into public.leaderboard_weekly
        (student_id, school_id, period_start, total_score, rank, updated_at)
  select student_id, school_id, period_start, total_score, rank, now()
  from   ranked
  on conflict (student_id, school_id, period_start)
  do update set
    total_score = excluded.total_score,
    rank        = excluded.rank,
    updated_at  = now();
end;
$$;

comment on function public.update_leaderboard_weekly_ranks(uuid, date) is
  'Recomputes DENSE_RANK over public.scores for one (school, weekly period_start) and upserts public.leaderboard_weekly. Idempotent. Uses leaderboard_weekly_school_period_idx.';

-- ----------------------------------------------------------------------------
-- INTEGRATION STEP for `public.recalculate_student_scores(p_submission_id uuid)`
-- ----------------------------------------------------------------------------
-- The existing RPC already computes the school_id and the weekly period_start
-- when it upserts into `public.scores`. Add a single call at the end of that
-- RPC, after the WEEKLY scores upsert succeeds:
--
--     perform public.update_leaderboard_weekly_ranks(v_school_id, v_week_start);
--
-- (Variable names will match whatever your existing function uses.)
--
-- No change is needed for the monthly path — `leaderboard_monthly` has been
-- removed; monthly winners are derived from `public.scores` during the
-- `process-period-end` edge function run.
-- ----------------------------------------------------------------------------
