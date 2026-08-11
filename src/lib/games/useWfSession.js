// Picks the next Word Family session for (student, level, step).
// Any session is playable at any time — no 3-day lock. LRU ordering keeps
// replay variety: never-played sessions surface first in curriculum order,
// then least-recently-played.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase.js';
import { getRefs } from './wfRefs.js';

export function useWfSession({ studentId, level = 'alpha', step }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'exhausted' | 'error'
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!studentId || !step) return;
    let cancelled = false;
    (async () => {
      setStatus('loading');
      setError(null);
      try {
        const refs = await getRefs();
        const gameId = refs.games.word_family;
        const levelId = refs.levels[level];
        if (!gameId || !levelId) throw new Error('Missing game/level reference');

        // Candidate sessions at this (game, level, step).
        const { data: candidates, error: cErr } = await supabase
          .from('word_family_sessions')
          .select('id, step, category_name, number_of_words, words, hint, time_limit_seconds, show_category_prompt, show_image, l1_support, require_production')
          .eq('game_id', gameId)
          .eq('level_id', levelId)
          .eq('step', step)
          .eq('is_active', true)
          .order('created_at', { ascending: true });
        if (cErr) throw cErr;
        if (cancelled) return;
        if (!candidates?.length) {
          // No content authored for this step yet.
          setStatus('exhausted');
          return;
        }

        // Look up last completion for each candidate by this student.
        const { data: attempts, error: aErr } = await supabase
          .from('word_family_attempts')
          .select('session_id, played_at')
          .eq('student_id', studentId)
          .in('session_id', candidates.map((s) => s.id))
          .in('attempt_status', ['completed', 'timeout'])
          .order('played_at', { ascending: false });
        if (aErr) throw aErr;
        if (cancelled) return;

        // Reduce to MAX(played_at) per session_id.
        const lastPlayed = new Map();
        for (const row of attempts ?? []) {
          if (!lastPlayed.has(row.session_id)) lastPlayed.set(row.session_id, row.played_at);
        }

        // If every session in this step has been played at least once, the step
        // is complete — surface 'exhausted' so the UI can show a completion screen
        // and route the kid to the next step. Prevents the "stuck-in-step" loop.
        const unplayed = candidates.filter((c) => !lastPlayed.has(c.id));
        if (unplayed.length === 0) {
          setStatus('exhausted');
          return;
        }

        // Serve the first unplayed session in strict curriculum order.
        // (candidates already ordered by created_at ASC.)
        setSession(unplayed[0]);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e.message ?? String(e));
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [studentId, level, step, nonce]);

  return { session, status, error, refetch };
}
