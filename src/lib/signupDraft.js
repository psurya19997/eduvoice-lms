/**
 * Small helper for carrying teacher signup state across the 3-step flow
 * (details → OTP → password). Uses sessionStorage so a refresh mid-flow
 * doesn't wipe the user's progress.
 *
 * Stored shape:
 *   { firstName, lastName, email, schoolId, schoolName }
 */
const KEY = 'eduvoice:teacher-signup-draft';

export function getDraft() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setDraft(patch) {
  const current = getDraft() ?? {};
  const next = { ...current, ...patch };
  sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearDraft() {
  sessionStorage.removeItem(KEY);
}
