// Module-level cache of reference IDs (games/levels/skills).
// Fetched once per app load; reused everywhere.

import { supabase } from '../supabase.js';

let cache = null;
let pending = null;

async function fetchRefs() {
  const [games, levels, skills] = await Promise.all([
    supabase.from('games').select('id, key'),
    supabase.from('levels').select('id, key'),
    supabase.from('skills').select('id, key'),
  ]);
  if (games.error) throw games.error;
  if (levels.error) throw levels.error;
  if (skills.error) throw skills.error;
  const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r.id]));
  cache = {
    games: byKey(games.data),
    levels: byKey(levels.data),
    skills: byKey(skills.data),
  };
  return cache;
}

/** Get cached refs, fetching on first call. Idempotent under concurrency. */
export async function getRefs() {
  if (cache) return cache;
  if (!pending) pending = fetchRefs().finally(() => { pending = null; });
  return pending;
}
