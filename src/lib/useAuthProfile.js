import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase.js';

/**
 * Lightweight auth hook. Loads the current Supabase user and their
 * profile row. If `requireRole` is passed and the profile doesn't match,
 * redirects to /login.
 *
 * Returns { user, profile, loading } — render a spinner while loading.
 */
export function useAuthProfile(requireRole) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const u = auth?.user ?? null;
      if (!u) {
        if (!cancelled) navigate('/login', { replace: true });
        return;
      }
      const { data: p } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, role, school_id, class, is_active')
        .eq('id', u.id)
        .maybeSingle();
      if (cancelled) return;
      if (!p || (requireRole && p.role !== requireRole) || !p.is_active) {
        navigate('/login', { replace: true });
        return;
      }
      setUser(u);
      setProfile(p);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireRole]);

  return { user, profile, loading };
}
