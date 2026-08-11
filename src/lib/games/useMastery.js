// Reads a student's current mastery rows and returns as { skillKey: mastery_pct }.
// Refetched when `nonce` changes so the WF Result screen can re-read post-write.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase.js';
import { getRefs } from './wfRefs.js';

export function useMastery(studentId) {
  const [mastery, setMastery] = useState({});
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const refs = await getRefs();
      const skillKeyById = Object.fromEntries(
        Object.entries(refs.skills).map(([k, id]) => [id, k]),
      );
      const { data, error } = await supabase
        .from('student_skill_mastery')
        .select('skill_id, mastery_pct')
        .eq('student_id', studentId);
      if (cancelled) return;
      if (!error && data) {
        const map = {};
        for (const r of data) map[skillKeyById[r.skill_id]] = r.mastery_pct;
        setMastery(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [studentId, nonce]);

  return { mastery, loading, refetch };
}
