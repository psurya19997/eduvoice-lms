import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * SchoolDropdown — fetches active schools from Supabase.
 *
 * Props:
 *   value       — currently selected school id (uuid) or ''
 *   onChange(id, name) — called when user picks a school
 *   placeholder — text to show when nothing is selected
 *   id          — html id (for <label htmlFor>)
 */
export default function SchoolDropdown({
  value = '',
  onChange,
  placeholder = 'Select your school',
  id,
}) {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('schools')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      if (error) setError(error.message);
      else setSchools(data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (e) => {
    const id = e.target.value;
    const school = schools.find((s) => s.id === id);
    onChange?.(id, school?.name ?? '');
  };

  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={handleChange}
        disabled={loading || !!error}
        className={`
          w-full h-14 rounded-2xl bg-white
          ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500
          px-4 pr-11 text-[15px] font-semibold
          appearance-none outline-none transition
          ${value ? 'text-slate-900' : 'text-slate-400'}
          disabled:bg-slate-100 disabled:text-slate-400
        `}
      >
        <option value="" disabled>
          {loading ? 'Loading schools…' : error ? 'Could not load schools' : placeholder}
        </option>
        {schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {/* Chevron */}
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 8l5 5 5-5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {error && (
        <p className="mt-2 text-xs font-semibold text-rose-600">
          {error}. Please refresh and try again.
        </p>
      )}
    </div>
  );
}
