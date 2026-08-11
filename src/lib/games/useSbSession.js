// Fetches the frontier Sentence Builder session for (student, level, step).
// Rule: Strict linear sequence. Returns the first session (by session_order)
// that has no 'completed' attempt.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase.js';
import { getRefs } from './wfRefs.js';

export function useSbSession({ studentId, level = 'alpha', step }) {
  const [session, setSession] = useState(null);
  const [character, setCharacter] = useState(null);
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
        const gameId = refs.games.sentence_builder;
        const levelId = refs.levels[level];
        if (!gameId || !levelId) throw new Error('Missing game/level reference');

        // Fetch all active sessions for this step, ordered strictly by session_order
        const { data: sessions, error: sErr } = await supabase
          .from('sentence_builder_sessions')
          .select('id, session_order, mechanic, story_name, context_setting, image_url, anchor_text, speaker_character, hint_1, hint_2, session_intro, time_limit_seconds, flash_duration_ms, voice_bonus_enabled, voice_prompt_text, layout, valid_sentences, tiles')
          .eq('game_id', gameId)
          .eq('level_id', levelId)
          .eq('step', step)
          .eq('is_active', true)
          .order('session_order', { ascending: true });
        
        if (sErr) throw sErr;
        if (cancelled) return;
        if (!sessions?.length) {
          setStatus('exhausted');
          return;
        }

        // Fetch all completed attempts by this student for these sessions
        const sessionIds = sessions.map(s => s.id);
        const { data: attempts, error: aErr } = await supabase
          .from('sentence_builder_attempts')
          .select('session_id')
          .eq('student_id', studentId)
          .eq('attempt_status', 'completed')
          .in('session_id', sessionIds);
          
        if (aErr) throw aErr;
        if (cancelled) return;

        const completedSessionIds = new Set(attempts?.map(a => a.session_id) || []);

        // The frontier is the first session (lowest session_order) that is NOT completed
        const frontier = sessions.find(s => !completedSessionIds.has(s.id));

        if (!frontier) {
          setStatus('exhausted'); // Student has finished all sessions in this step!
          setCharacter(null);
          return;
        }

        // Hydrate character portrait if the session has a speaker_character (variants D and E).
        let characterRow = null;
        if (frontier.speaker_character) {
          const { data: charData, error: charErr } = await supabase
            .from('game_characters')
            .select('key, display_name, portrait_url, bio_en, bio_hi')
            .eq('key', frontier.speaker_character)
            .maybeSingle();
          if (charErr) throw charErr;
          if (cancelled) return;
          characterRow = charData ?? null;
        }

        setSession(frontier);
        setCharacter(characterRow);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e.message ?? String(e));
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [studentId, level, step, nonce]);

  return { session, character, status, error, refetch };
}
