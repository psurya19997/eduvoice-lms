/**
 * Synthetic email used as the Supabase Auth identifier for students.
 * Format: {phone}_{firstname}@students.eduvoice.app
 *   - phone:     digits only
 *   - firstname: lowercase, alphanumeric only
 *
 * Deterministic per (phone, first_name) so we can reconstruct it at login.
 */
export function studentSyntheticEmail(phone, firstName) {
  const phoneDigits = String(phone ?? '').replace(/\D/g, '');
  const fn = String(firstName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${phoneDigits}_${fn}@students.eduvoice.app`;
}
