-- 20260810000003_storyteller_review_worker_cron.sql
-- Schedules the st_review_worker edge function to fire every 10 minutes.
-- Uses pg_cron + pg_net + vault.
--
-- Prerequisite (Dashboard, one-time):
--   Project Settings → Vault → New Secret named "SERVICE_ROLE_KEY", value = your service role JWT.

-- Extensions are pre-installed on Supabase, but keep the CREATE guarded to make
-- this migration replayable on a fresh project.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent unschedule (safe on first run — no-op if the job doesn't exist).
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'st-review-worker-every-10min'
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'st-review-worker-every-10min',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xlqnueqyqesfqwkbpwud.supabase.co/functions/v1/st_review_worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (SELECT decrypted_secret FROM vault.decrypted_secrets
         WHERE name = 'SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);
