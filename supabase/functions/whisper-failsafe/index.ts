import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  console.log("1. Waking up to check for audio files...");

  const thresholdTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  console.log("2. Looking for audio files older than:", thresholdTime);

  const { data: stuckSubmissions, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('submission_type', 'audio')
    .is('transcript', null)
    .lt('submitted_at', thresholdTime);

  if (error) {
    console.error("3. DATABASE ERROR:", error);
  } else {
    console.log(`3. Found ${stuckSubmissions?.length || 0} files to process.`);
  }

  for (const sub of (stuckSubmissions || [])) {
    console.log(`4. Processing submission ID: ${sub.id}`);
    try {
      const fetchUrl = sub.file_url.startsWith('http') 
        ? sub.file_url 
        : supabase.storage.from('submissions').getPublicUrl(sub.file_url).data.publicUrl;

      console.log(`5. Downloading audio from: ${fetchUrl}`);
      const audioFile = await fetch(fetchUrl);
      const blob = await audioFile.blob();
      
      console.log(`6. File size is ${blob.size} bytes`);
      if (blob.size < 100) {
        console.log("7. File is too small/corrupted. Skipping to save money.");
        await supabase.from('submissions').update({ transcript: '[Recording Error]' }).eq('id', sub.id);
        continue;
      }

      console.log("8. Sending to OpenAI Whisper...");
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      formData.append("model", "whisper-1");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
        body: formData,
      });

      const result = await res.json();
      if (result.error) {
         console.error("9. OPENAI ERROR:", result.error);
         continue;
      }

      let finalStr = result.text || "";
      console.log(`10. Whisper returned: "${finalStr}"`);

      const hallucinations = ["Thank you.", "Subtitle by", "Thanks for watching", "Please subscribe"];
      const isHallucination = hallucinations.some(h => finalStr.toLowerCase().includes(h.toLowerCase()));

      if (!finalStr.trim() || isHallucination) {
        finalStr = '[No Speech Detected]';
      }

      console.log("11. Saving to database...");
      await supabase.from('submissions').update({ 
        transcript: finalStr,
        total_words: finalStr.startsWith('[') ? 0 : finalStr.split(' ').length 
      }).eq('id', sub.id);

      await supabase.rpc('recalculate_student_scores', { p_submission_id: sub.id });
      console.log("12. Done processing ID:", sub.id);

    } catch (e) { 
      console.error("ERROR processing sub", sub.id, e); 
    }
  }
  
  console.log("13. Cleanup Complete. Going back to sleep.");
  return new Response("Cleanup Complete");
})