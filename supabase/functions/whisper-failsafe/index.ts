// ============================================================================
// whisper-failsafe — DEPLOYED VERSION (v10, active on live project)
//
// This file mirrors the source currently running on Supabase, retrieved via
// get_edge_function('whisper-failsafe') on 2026-07-24.
//
// A more advanced version with segment-level hallucination filtering, an
// expanded junk/prompt-echo list, and a no-prompt strategy exists at
//   docs-archive/supabase-functions-improvements-not-deployed/whisper-failsafe/index.ts
// It was intentionally NOT deployed — treat that archived file as reference
// for planned improvements, not as what runs today.
//
// Invocation: pg_cron job `audio-failsafe-check` (jobid 8) POSTs to
// /functions/v1/whisper-failsafe every 30 minutes with a service-role JWT.
// See supabase/live-schema.sql section 5.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      formData.append("prompt", "Transcribe the student speaking clearly, including all repetitions and filler words.");

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
      let finalStr = result.text || "";

      const junk = ["Thank you.", "Subtitle by", "Thanks for watching", "Please subscribe", "Amara.org"];
      junk.forEach(p => {
        const reg = new RegExp(p, "gi");
        finalStr = finalStr.replace(reg, "");
      });

      const durationMin = detectedDuration / 60;
      const wpm = durationMin > 0 ? (finalStr.trim().split(/\s+/).length / durationMin) : 0;

      // Smart Retry for Quality
      if (wpm < 30 && !finalStr.startsWith('[')) {
        formData.set("prompt", "The audio is very quiet or has background noise. Transcribe every single word the child says.");
        const retryRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
          body: formData,
        });
        const retryResult = await retryRes.json();
        if (retryResult.text && retryResult.text.length > finalStr.length) {
          finalStr = retryResult.text;
          detectedDuration = parseFloat(retryResult.duration) || detectedDuration;
        }
      }

      finalStr = finalStr.trim() || '[No Speech Detected]';

      // --- TIERED UPDATE LOGIC ---
      let transcriptToSave = sub.transcript;
      let newRetryCount = sub.retry_count || 0;

      if (sub.transcript === null) {
        // CASE: Initial Fill - Fill and keep retry at 0 for a second pass
        transcriptToSave = finalStr;
        newRetryCount = 0;
      } else {
        // CASE: Quality/Duration Rescue - Set retry to 1 to lock it
        newRetryCount = 1;
        if (wpm < 30) {
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
          total_words: transcriptToSave.startsWith('[') ? 0 : transcriptToSave.split(/\s+/).length,
          retry_count: newRetryCount
        })
        .eq('id', sub.id);

      if (!updateError) {
        await supabase.rpc('recalculate_student_scores', { p_student_id: sub.student_id });
      }

    } catch (e) {
      console.error("CRITICAL ERROR:", e);
    }
  }
  return new Response("Fail-Safe Batch Complete");
})
