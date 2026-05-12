import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Prompt-echo phrases — Whisper sometimes regurgitates the `prompt` parameter
// into the transcript on silent/quiet audio. We strip them at both the segment
// level and as a final safety net on the joined string.
const PROMPT_ECHO_PHRASES = [
  "transcribe every single word",
  "transcribe the student",
  "background noise",
  "the child says",
  "including all repetitions",
  "filler words",
];

// Per-segment thresholds from Whisper's verbose_json output:
//   no_speech_prob > 0.6  → Whisper is fairly sure this segment is silence/noise,
//                           so its "text" is likely a hallucinated fill-in.
//   avg_logprob   < -1.0  → token confidence is low; these are the segments
//                           where Whisper most often invents prompt echoes or
//                           subtitle-style boilerplate.
const NO_SPEECH_PROB_MAX = 0.6;
const AVG_LOGPROB_MIN = -1.0;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function filterSegments(segments: any[]): any[] {
  if (!Array.isArray(segments)) return [];
  return segments.filter((seg) => {
    if (typeof seg?.text !== 'string') return false;
    if (typeof seg.no_speech_prob === 'number' && seg.no_speech_prob > NO_SPEECH_PROB_MAX) return false;
    if (typeof seg.avg_logprob === 'number' && seg.avg_logprob < AVG_LOGPROB_MIN) return false;
    const lower = seg.text.toLowerCase();
    if (PROMPT_ECHO_PHRASES.some((p) => lower.includes(p))) return false;
    return true;
  });
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  console.log("1. Starting Fail-Safe: Checking for stuck audio...");
  const thresholdTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // Selection Logic: Pick up rows with NULL transcript OR 0 duration
  const { data: stuckSubmissions, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('submission_type', 'audio')
    .lt('submitted_at', thresholdTime)
    .lt('retry_count', 1)
    .or('transcript.is.null,audio_duration.eq.0')
    .limit(10);

  if (error) {
    console.error("3. DATABASE ERROR:", error);
    return new Response("DB Error", { status: 500 });
  }

  for (const sub of (stuckSubmissions || [])) {
    console.log(`4. Processing ID: ${sub.id}`);
    try {
      const fetchUrl = sub.file_url.startsWith('http')
        ? sub.file_url
        : supabase.storage.from('submissions').getPublicUrl(sub.file_url).data.publicUrl;

      const audioFile = await fetch(fetchUrl);
      const blob = await audioFile.blob();

      if (blob.size < 100) {
        await supabase.from('submissions').update({ transcript: '[Recording Error]', retry_count: 1 }).eq('id', sub.id);
        continue;
      }

      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("response_format", "verbose_json");
      // NOTE: No `prompt` is sent. Whisper treats `prompt` as prior speech, not
      // an instruction, and echoes it into the transcript on silent intros.

      let res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
        body: formData,
      });

      let result = await res.json();

      // --- ADDED SAFETY FOR DECODING ERRORS ---
      if (result.error) {
        console.error(`AI Error for ${sub.id}:`, result.error.message);

        // If the AI can't read the file, mark it as [Corrupt] and set retry_count to 1 to stop the loop
        if (result.error.message.includes("could not be decoded") || result.error.message.includes("format is not supported")) {
          await supabase
            .from('submissions')
            .update({
              transcript: '[Corrupt/Unreadable Audio]',
              retry_count: 1,
              audio_duration: 0
            })
            .eq('id', sub.id);
        }
        continue;
      }

      let detectedDuration = parseFloat(result.duration) || 0;

      // Filter segments to drop silence, low-confidence, and prompt-echo lines.
      const originalSegments = Array.isArray(result.segments) ? result.segments : [];
      let cleanSegments = filterSegments(originalSegments);
      let finalStr = cleanSegments.map((s: any) => s.text).join(' ');

      // Final-pass junk filter on the joined string — includes both the
      // historical subtitle-spam phrases and the prompt-echo phrases as a
      // safety net in case any slipped past segment filtering.
      const junk = [
        "Thank you.",
        "Subtitle by",
        "Thanks for watching",
        "Please subscribe",
        "Amara.org",
        "MBC 뉴스",
        "字幕 by",
        "Transcription by",
        "♪",
        ...PROMPT_ECHO_PHRASES,
      ];
      junk.forEach(p => {
        const reg = new RegExp(escapeRegex(p), "gi");
        finalStr = finalStr.replace(reg, "");
      });

      // WPM uses the FULL clip duration (not speech span) on purpose: a 30s
      // recording with 10s of speech should score against the full 30s, since
      // that reflects real reading performance against the recording window.
      const durationMin = detectedDuration / 60;
      const wpm = durationMin > 0 ? (finalStr.trim().split(/\s+/).filter(Boolean).length / durationMin) : 0;

      // Smart Retry: only retry when there's evidence of real failure.
      //   (a) we filtered out everything despite Whisper hearing something, or
      //   (b) speech exists but is sparse (low WPM with >=2 clean segments).
      const shouldRetry = !finalStr.trim().startsWith('[') && (
        (finalStr.trim().length === 0 && blob.size > 100 && originalSegments.length > 0) ||
        (wpm < 30 && cleanSegments.length >= 2)
      );

      if (shouldRetry) {
        // Retry with NO prompt — passing a different prompt only gives Whisper
        // new words to echo back on quiet audio. Build a fresh FormData rather
        // than reusing the original to avoid any "body already consumed" risk.
        const retryFormData = new FormData();
        retryFormData.append("file", blob, "audio.webm");
        retryFormData.append("model", "whisper-1");
        retryFormData.append("response_format", "verbose_json");

        const retryRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
          body: retryFormData,
        });
        const retryResult = await retryRes.json();
        if (!retryResult.error) {
          const retrySegments = Array.isArray(retryResult.segments) ? retryResult.segments : [];
          const retryClean = filterSegments(retrySegments);
          let retryStr = retryClean.map((s: any) => s.text).join(' ');
          junk.forEach(p => {
            const reg = new RegExp(escapeRegex(p), "gi");
            retryStr = retryStr.replace(reg, "");
          });
          if (retryStr.trim().length > finalStr.trim().length) {
            finalStr = retryStr;
            cleanSegments = retryClean;
            detectedDuration = parseFloat(retryResult.duration) || detectedDuration;
          }
        }
      }

      finalStr = finalStr.trim().replace(/\s+/g, ' ') || '[No Speech Detected]';

      // Recompute WPM after retry/cleanup — still against full clip duration.
      const finalDurationMin = detectedDuration / 60;
      const finalWpm = finalDurationMin > 0 && !finalStr.startsWith('[')
        ? (finalStr.split(/\s+/).filter(Boolean).length / finalDurationMin)
        : 0;

      // --- TIERED UPDATE LOGIC ---
      let transcriptToSave = sub.transcript;
      let newRetryCount = sub.retry_count || 0;

      if (sub.transcript === null) {
        // CASE: Initial Fill - Fill and keep retry at 0 for a second pass,
        // UNLESS the result is a bracketed sentinel (e.g. [No Speech Detected]),
        // in which case there's nothing worth rescuing — lock retry to 1.
        transcriptToSave = finalStr;
        newRetryCount = finalStr.startsWith('[') ? 1 : 0;
      } else {
        // CASE: Quality/Duration Rescue - Set retry to 1 to lock it
        newRetryCount = 1;
        if (finalWpm < 30) {
          transcriptToSave = finalStr; // Overwrite poor quality
        }
        // If WPM > 30, we keep the original sub.transcript
      }

      // FINAL UPDATE
      const { error: updateError } = await supabase
        .from('submissions')
        .update({
          transcript: transcriptToSave,
          audio_duration: detectedDuration,
          total_words: transcriptToSave.startsWith('[') ? 0 : transcriptToSave.split(/\s+/).filter(Boolean).length,
          retry_count: newRetryCount
        })
        .eq('id', sub.id);

      if (!updateError) {
        await supabase.rpc('recalculate_student_scores', { p_submission_id: sub.id });
      }

    } catch (e) {
      console.error("CRITICAL ERROR:", e);
    }
  }
  return new Response("Fail-Safe Batch Complete");
})
