// st_review_recording — Gemini-based analyzer for a single practice attempt.
//
// Input:   { attempt_id: uuid }         (POST body)
// Effect:  reads the attempt + item + story context; fetches audio via signed URL;
//          calls Gemini flash-latest with audio + JSON response schema; computes
//          final_score; UPDATEs the row → trigger inserts game_score.
//
// Retry policy: up to 3 inline retries (backoff 500ms → 1500ms → 3000ms) before
// giving up and leaving the row in `submitted_pending` OR marking `failed` if the
// row has already been retried 3 times inline plus 5 times by the backend worker
// (gemini_attempts >= 8 → 'failed').
//
// Auth model: this function uses the service role key (bypasses RLS). Callers are
// either the client (submit) or the retry worker.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY       = Deno.env.get('GEMINI_API_KEY')!;

const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const MAX_INLINE_RETRIES = 3;
const MAX_TOTAL_ATTEMPTS = 8;      // 3 inline + 5 backend-worker
const BACKOFF_MS         = [500, 1500, 3000];

// CORS — browsers send an OPTIONS preflight before every cross-origin POST.
// Without these headers the preflight 405s and the client-side invoke() dies
// before it ever reaches this function.
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------- Prompt + response schema ----------

const SYSTEM_PROMPT = `You are an English teacher evaluating a young Indian child (age 6-12)
who just spoke an answer to a practice item about a story they read.

Your job: return ONE JSON object matching the response schema.
Return ONLY JSON. No prose outside JSON.

DEFINITIONS
  transcript
    Verbatim of what the child spoke. Keep umms, false starts, silences.
    Do NOT clean or paraphrase.
  word_count_total
    Total spoken words after transcription (child only).
  unique_english
    Count of DISTINCT English words. Case-insensitive, punctuation stripped.
    Stop words count. Character/place names do NOT count.
  unique_hindi
    Same for Hindi words. Include romanized Hindi (kya, hai, woh) and Devanagari.
    Names do NOT count.
  relevance_band (0-3)
    0 = off-topic; 1 = tangentially related; 2 = mostly on topic, some drift or
    a factual error; 3 = clearly on topic (personal asides stay at 3).
  coverage_band (0-3)
    NUMBER of beats from the beats list that the child mentioned. Yes/no per beat,
    sum. If beats list is shorter than 3, cap at that count.
  beats_covered
    Array of beat IDs the child mentioned. Do NOT invent IDs outside the given list.
  positive_note
    ONE warm, specific praise sentence. Never generic.
  next_step
    ONE concrete action for next time. Never a list. NEVER reveal missing plot;
    ask a question instead.

TONE
  - Praise first, correct second, action third.
  - Never "wrong", "bad", "no". Prefer "try", "next time", "add".
  - Match the child's language mix: mostly Hindi → reply Hinglish;
    balanced → Hinglish leaning English; mostly English → pure English.

LANGUAGE RULES
  - Romanized Hindi ("kya", "hai", "woh") counts as Hindi.
  - English words inside Hindi sentences count as English.
  - Character / place names count as neither.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  required: ['transcript','word_count_total','unique_english','unique_hindi',
             'relevance_band','coverage_band','beats_covered',
             'positive_note','next_step'],
  properties: {
    transcript:       { type: 'string' },
    word_count_total: { type: 'integer' },
    unique_english:   { type: 'integer' },
    unique_hindi:     { type: 'integer' },
    relevance_band:   { type: 'integer' },
    coverage_band:    { type: 'integer' },
    beats_covered:    { type: 'array', items: { type: 'string' } },
    positive_note:    { type: 'string' },
    next_step:        { type: 'string' },
  },
};

// ---------- Scoring ----------

const VOCAB_CAP = 50;

function computePracticeScore(a: {
  relevance_band: number; coverage_band: number;
  unique_english: number; unique_hindi: number;
}): number {
  if (a.relevance_band === 0) return 0;
  const quality_pct = (a.relevance_band + a.coverage_band) / 6;
  const vocab_raw   = a.unique_english * 2 + a.unique_hindi;
  const vocab_pct   = Math.min(vocab_raw, VOCAB_CAP) / VOCAB_CAP;
  return Math.round((quality_pct * 0.7 + vocab_pct * 0.3) * 100);
}

// ---------- Gemini call with retry ----------

async function callGemini(userText: string, audioB64: string, mimeType: string) {
  let lastErr: Error | null = null;
  for (let i = 0; i < MAX_INLINE_RETRIES; i++) {
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: 'user',
            parts: [
              { text: userText },
              { inline_data: { mime_type: mimeType, data: audioB64 } },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.4,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`gemini ${res.status}: ${body.slice(0, 500)}`);
      }
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error(`gemini no text; finishReason=${json.candidates?.[0]?.finishReason}`);
      return JSON.parse(text);
    } catch (e) {
      lastErr = e as Error;
      if (i < MAX_INLINE_RETRIES - 1) await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));
    }
  }
  throw lastErr!;
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405, headers: CORS });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  let body: { attempt_id?: string; typed_transcript?: string };
  try { body = await req.json(); } catch { return jsonError(400, 'invalid_json'); }
  const attemptId = body.attempt_id;
  if (!attemptId) return jsonError(400, 'missing_attempt_id');

  // 1. Fetch attempt + item
  const { data: attempt, error: aErr } = await sb
    .from('storyteller_practice_attempts')
    .select('*, item:storyteller_practice_items(id, game_id, level_id, step, mode, content)')
    .eq('id', attemptId)
    .single();
  if (aErr || !attempt) return jsonError(404, `attempt_not_found: ${aErr?.message}`);

  // Skip if already completed or beyond total retry budget.
  if (attempt.attempt_status === 'completed') return jsonOk({ ok: true, skipped: 'already_completed' });
  if ((attempt.gemini_attempts ?? 0) >= MAX_TOTAL_ATTEMPTS) {
    await sb.from('storyteller_practice_attempts').update({
      attempt_status: 'failed',
      gemini_error: 'max_attempts_reached',
    }).eq('id', attemptId);
    return jsonOk({ ok: false, marked: 'failed' });
  }

  // 2. Build story context (all paragraphs concatenated, English side).
  const { data: sessions } = await sb.from('storyteller_sessions')
    .select('sentences_en, story_name')
    .eq('level_id', attempt.item.level_id)
    .eq('step', attempt.item.step)
    .eq('is_active', true)
    .order('session_order');
  const storyName = sessions?.[0]?.story_name ?? '';
  const storyText = (sessions ?? []).flatMap((s: any) => s.sentences_en.map((x: any) => x.text)).join(' ');

  // 3. Build the user prompt text.
  const c = attempt.item.content ?? {};
  const beats: Array<{ id: string; text: string }> = c.beats ?? [];
  const roleplayBits = attempt.item.mode === 'roleplay'
    ? `\n  Scene: "${c.scene_setup ?? ''}"\n  Child is playing: "${c.child_role ?? ''}"`
    : '';
  const beatsList = beats.map((b) => `- ${b.id}: ${b.text}`).join('\n');
  const userText = `STORY CONTEXT:
Title: "${storyName}"
Full story: ${storyText}

PRACTICE ITEM:
Mode: ${attempt.item.mode}
Prompt to child: "${c.prompt ?? ''}"${roleplayBits}

BEATS TO CHECK (yes/no per beat — return which IDs the child mentioned):
${beatsList}

Now return the JSON object.`;

  // 4. Get the audio bytes (unless typed).
  let analysis;
  try {
    if (attempt.input_mode === 'typed') {
      // For typed input we haven't got audio — send the transcript directly as a text-only call.
      // Cheap and simple: reuse the same prompt but with the typed text inline.
      const typedText = attempt.transcript ?? body.typed_transcript ?? '';
      const textOnlyRes = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [
            { text: userText + `\n\nCHILD'S TYPED RESPONSE:\n"""${typedText}"""` },
          ]}],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.4,
          },
        }),
      });
      if (!textOnlyRes.ok) throw new Error(`gemini ${textOnlyRes.status}: ${await textOnlyRes.text()}`);
      const j = await textOnlyRes.json();
      analysis = JSON.parse(j.candidates[0].content.parts[0].text);
    } else {
      const { data: signed, error: sErr } = await sb.storage
        .from('storyteller-audio-private')
        .createSignedUrl(attempt.audio_url, 60);
      if (sErr || !signed?.signedUrl) throw new Error(`signed_url_failed: ${sErr?.message}`);
      const audioRes = await fetch(signed.signedUrl);
      if (!audioRes.ok) throw new Error(`audio_fetch_failed: ${audioRes.status}`);
      const audioBuf = new Uint8Array(await audioRes.arrayBuffer());
      // base64 encode (Deno has this)
      const audioB64 = base64Encode(audioBuf);
      const mimeType = audioRes.headers.get('content-type') || 'audio/webm';
      analysis = await callGemini(userText + '\n\nCHILD\'S AUDIO RESPONSE:', audioB64, mimeType);
    }
  } catch (e) {
    const err = e as Error;
    const nextAttempts = (attempt.gemini_attempts ?? 0) + 1;
    const nextStatus = nextAttempts >= MAX_TOTAL_ATTEMPTS ? 'failed' : 'submitted_pending';
    await sb.from('storyteller_practice_attempts').update({
      attempt_status: nextStatus,
      gemini_error: err.message.slice(0, 500),
      gemini_attempts: nextAttempts,
    }).eq('id', attemptId);
    return jsonError(500, `gemini_failed: ${err.message}`);
  }

  // 5. Compute score + write. word_count_total===0 → mark as no_speech.
  const finalScore = computePracticeScore(analysis);
  const isNoSpeech = (analysis.word_count_total ?? 0) === 0;

  const { error: updErr } = await sb.from('storyteller_practice_attempts').update({
    attempt_status: isNoSpeech ? 'no_speech' : 'completed',
    transcript: analysis.transcript,
    word_count_total: analysis.word_count_total,
    unique_english: analysis.unique_english,
    unique_hindi: analysis.unique_hindi,
    relevance_band: analysis.relevance_band,
    coverage_band: analysis.coverage_band,
    beats_covered: analysis.beats_covered,
    positive_note: analysis.positive_note,
    next_step: analysis.next_step,
    final_score: isNoSpeech ? 0 : finalScore,
    gemini_attempts: (attempt.gemini_attempts ?? 0) + 1,
    gemini_error: null,
    reviewed_at: new Date().toISOString(),
  }).eq('id', attemptId);
  if (updErr) return jsonError(500, `update_failed: ${updErr.message}`);

  // Refresh weekly/monthly leaderboard rollup. Best-effort — a failure here
  // must NOT roll back the score write (game_score row is already in via trigger).
  // Same pattern as wfComplete.js / sbComplete.js on the client. Doing it here
  // in the edge fn covers the client-navigated-away + cron-worker-retry cases.
  try {
    await sb.rpc('recalculate_student_scores', { p_student_id: attempt.student_id });
  } catch (e) {
    console.error(`[st_review_recording] recalc failed for ${attempt.student_id}:`, e);
  }

  return jsonOk({ ok: true, attempt_id: attemptId, final_score: isNoSpeech ? 0 : finalScore });
});

// ---------- helpers ----------

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function jsonOk(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
