// stAudioUpload — turns a recorded audio blob into a submitted practice attempt.
//
// Flow:
//   1. Generate an attempt UUID client-side (used as both DB row PK and storage filename).
//   2. Upload the blob to storyteller-audio-private/<auth.uid()>/<attempt_id>.<ext>
//      (bucket RLS enforces the uid prefix.)
//   3. Insert a storyteller_practice_attempts row with attempt_status='submitted_pending'.
//   4. Optionally invoke the review edge function (fire-and-forget — Phase 2C).
//
// Returns { attemptId, error }. Caller polls the row for status updates.

import { supabase } from '../supabase.js';

const BUCKET = 'storyteller-audio-private';

function extForMime(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export async function submitPracticeAttempt({
  studentId,
  practiceItemId,
  blob,
  mimeType,
  durationMs,          // total time from prompt-shown → submit
  audioDurationMs,     // recorded audio length
}) {
  if (!studentId || !practiceItemId) return { error: 'missing_ids' };

  const attemptId = crypto.randomUUID();
  const path = `${studentId}/${attemptId}.${extForMime(mimeType)}`;

  // 1. Upload
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: mimeType || 'audio/webm',
      upsert: false,                                        // fresh UUID → never collides
      cacheControl: '3600',
    });
  if (upErr) return { error: `upload_failed: ${upErr.message}` };

  // 2. Insert attempt row (RLS enforces student_id = auth.uid())
  const { error: insErr } = await supabase
    .from('storyteller_practice_attempts')
    .insert({
      id: attemptId,
      student_id: studentId,
      practice_item_id: practiceItemId,
      input_mode: 'spoken',
      attempt_status: 'submitted_pending',
      audio_url: path,
      audio_duration_ms: audioDurationMs ?? null,
      duration_ms: durationMs,
    });
  if (insErr) {
    // Best-effort: try to remove the orphaned audio so the bucket doesn't leak.
    supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    return { error: `insert_failed: ${insErr.message}` };
  }

  // 3. Fire the review edge function (Phase 2C — may not exist yet; ignore failures).
  supabase.functions.invoke('st_review_recording', {
    body: { attempt_id: attemptId },
  }).catch(() => { /* backend worker will pick it up */ });

  return { attemptId, error: null };
}

// Typed-input fallback for kids whose mic is unavailable. Same shape as
// submitPracticeAttempt but no upload — audio_url stays null.
export async function submitPracticeTyped({
  studentId, practiceItemId, transcript, durationMs,
}) {
  if (!studentId || !practiceItemId) return { error: 'missing_ids' };
  const attemptId = crypto.randomUUID();

  const { error: insErr } = await supabase
    .from('storyteller_practice_attempts')
    .insert({
      id: attemptId,
      student_id: studentId,
      practice_item_id: practiceItemId,
      input_mode: 'typed',
      attempt_status: 'submitted_pending',
      audio_url: null,
      audio_duration_ms: null,
      duration_ms: durationMs,
      transcript,                                           // pre-filled since we skip STT
    });
  if (insErr) return { error: `insert_failed: ${insErr.message}` };

  supabase.functions.invoke('st_review_recording', {
    body: { attempt_id: attemptId, typed_transcript: transcript },
  }).catch(() => {});

  return { attemptId, error: null };
}
