// st_tts_feedback — synthesizes short feedback text with Google Cloud TTS.
//
// Uses the SAME voice as the Nina story narrator so kids hear one consistent
// "teacher" throughout the app (locked in scripts/seed-storyteller.mjs).
//
// Input:   POST { text: string, lang?: 'en' | 'hi' }  (lang defaults to 'en')
// Output:  audio/mpeg body (binary MP3)
//
// Cost: ~$0.0001 per feedback line (single sentence, Wavenet tier).

const GOOGLE_TTS_API_KEY = Deno.env.get('GOOGLE_TTS_API_KEY');

if (!GOOGLE_TTS_API_KEY) {
  console.error('GOOGLE_TTS_API_KEY not set in edge function secrets');
}

const VOICES = {
  en: { languageCode: 'en-IN', name: 'en-IN-Wavenet-E', speakingRate: 0.9, pitch: 1.0 },
  hi: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-F', speakingRate: 0.95, pitch: 0.0 },
};

// CORS — the browser calls this directly to get feedback audio; preflight
// OPTIONS must return 200 with these headers or the audio fetch dies.
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  if (!GOOGLE_TTS_API_KEY) {
    return new Response(JSON.stringify({ error: 'missing_google_tts_key' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  let body: { text?: string; lang?: 'en' | 'hi' };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const text = (body.text ?? '').trim();
  if (!text) {
    return new Response(JSON.stringify({ error: 'empty_text' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  if (text.length > 800) {
    return new Response(JSON.stringify({ error: 'text_too_long' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const voice = VOICES[body.lang ?? 'en'] ?? VOICES.en;

  // Wrap in SSML so we can add a small opening pause for a smoother start.
  const ssml = `<speak><break time="200ms"/>${escapeXml(text)}</speak>`;

  const ttsRes = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { ssml },
        voice: { languageCode: voice.languageCode, name: voice.name },
        audioConfig: {
          audioEncoding: 'MP3',
          sampleRateHertz: 24000,
          speakingRate: voice.speakingRate,
          pitch: voice.pitch,
        },
      }),
    },
  );

  if (!ttsRes.ok) {
    const errText = await ttsRes.text();
    return new Response(JSON.stringify({ error: `google_tts_${ttsRes.status}`, detail: errText.slice(0, 500) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const json = await ttsRes.json();
  const audioBase64 = json.audioContent as string;
  const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',   // clients may cache identical replays for an hour
      ...CORS,
    },
  });
});
