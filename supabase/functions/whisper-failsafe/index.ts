import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  console.log("1. Starting Fail-Safe: Checking for stuck audio...");

  // Only process files older than 30 mins to allow the app to try first
  const thresholdTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: stuckSubmissions, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('submission_type', 'audio')
    .is('transcript', null)
    .lt('submitted_at', thresholdTime)
    .lt('retry_count', 1) // Only pick up files never retried
    .limit(10); // Batching to prevent timeout

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
      
      // Basic corruption check
      if (blob.size < 100) {
        await supabase.from('submissions').update({ transcript: '[Recording Error]' }).eq('id', sub.id);
        continue;
      }

      // FIRST AI ATTEMPT
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("response_format", "verbose_json"); // Gets duration for free!
      formData.append("prompt", "Transcribe the student speaking clearly, including all repetitions and filler words.");

      let res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
        body: formData,
      });

      let result = await res.json();
      if (result.error) {
        console.error(`AI Error for ${sub.id}:`, result.error.message);
        continue; // Skip and try next run (doesn't increment retry_count)
      }

      let detectedDuration = result.duration || 0;
      let finalStr = result.text || "";

      // SCRUBBING: Remove common hallucinations
      const junk = ["Thank you.", "Subtitle by", "Thanks for watching", "Please subscribe", "Amara.org"];
      junk.forEach(p => { 
        const reg = new RegExp(p, "gi");
        finalStr = finalStr.replace(reg, ""); 
      });

      // SMART RETRY: If WPM is < 15, try high-sensitivity mode
      const durationMin = detectedDuration / 60;
      const wpm = durationMin > 0 ? (finalStr.split(/\s+/).length / durationMin) : 0;

      if (wpm < 15 && !finalStr.startsWith('[')) {
        console.log(`⚠️ Low WPM (${wpm.toFixed(1)}). Retrying with high-sensitivity...`);
        formData.set("prompt", "The audio is very quiet or has background noise. Transcribe every single word the child says.");
        
        const retryRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
          body: formData,
        });
        
        const retryResult = await retryRes.json();
        if (retryResult.text && retryResult.text.length > finalStr.length) {
          finalStr = retryResult.text; // Keep the better version
        }
      }

      finalStr = finalStr.trim() || '[No Speech Detected]';

      // FINAL UPDATE: Mark as completed by incrementing retry_count
      await supabase.from('submissions').update({ 
        transcript: finalStr,
        audio_duration: detectedDuration,
        total_words: finalStr.startsWith('[') ? 0 : finalStr.split(/\s+/).length,
        retry_count: (sub.retry_count || 0) + 1 
      }).eq('id', sub.id);

      // Trigger leaderboard recalculation
      await supabase.rpc('recalculate_student_scores', { p_submission_id: sub.id });
      console.log(`✅ Success: ${sub.id} processed.`);

    } catch (e) { 
      console.error("CRITICAL ERROR:", e); 
    }
  }
  
  return new Response("Fail-Safe Batch Complete");
})