// stFeedbackTTS — thin wrapper around the st_tts_feedback edge function.
// Returns an object URL (or null on failure) that can be fed to <audio src>.

import { supabase } from '../supabase.js';

export async function fetchFeedbackAudio(text) {
  if (!text || !text.trim()) return null;
  try {
    // Use functions.invoke so auth JWT is attached automatically.
    // The edge function returns a raw MP3 body (audio/mpeg), so we request Blob.
    const { data, error } = await supabase.functions.invoke('st_tts_feedback', {
      body: { text, lang: 'en' },
    });
    if (error) throw error;
    // supabase.functions.invoke returns Blob when the response is binary.
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'audio/mpeg' });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
