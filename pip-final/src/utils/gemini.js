// Thin wrapper around Google's Gemini REST API (generateContent).
// Docs: https://ai.google.dev/api/generate-content
//
// The API key and model now come from .env (VITE_GEMINI_API_KEY / VITE_GEMINI_MODEL)
// instead of being pasted into Profile Settings — .env values are baked in at build
// time, so they're still visible in the shipped browser bundle. Fine for a
// personal/school project; a real product would proxy this through a backend.

const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash'

const SYSTEM_INSTRUCTION = `You are Pip, a friendly, upbeat health buddy chatting with a child (around 8-12 years old).
Rules you must always follow:
- Use short sentences and simple, warm, encouraging language a child can understand.
- You are NOT a doctor and must never give a diagnosis, medication advice, or dosages.
- Only give general, safe, everyday wellness suggestions (rest, water, telling a grown-up, etc).
- If anything sounds serious, urgent, or you are unsure, tell the child to go find a grown-up or doctor right away.
- Keep replies brief: 2-5 short sentences, plus at most one follow-up question.
- Be kind and never scary, even when telling them to get help.`

// Whether a Gemini key is configured at all (used to show/hide chat UI)
export function hasGeminiKey() {
  return Boolean(API_KEY)
}

/**
 * Send a chat message (with optional vitals context) to Gemini and return the reply text.
 * @param {object} opts
 * @param {{role:'user'|'model', text:string}[]} opts.history
 * @param {string} opts.message
 * @param {object|null} opts.vitals - optional { symptoms, temperature, heartRate, mood }
 */
export async function askGemini({ history = [], message, vitals = null }) {
  if (!API_KEY) {
    throw new Error('Gemini API key missing. Add VITE_GEMINI_API_KEY to your .env file.')
  }

  const vitalsLine = vitals
    ? `\n\nHere is the child's latest check-in data as parameters — use it to personalise your answer:\n` +
      `symptoms: ${vitals.symptoms?.length ? vitals.symptoms.join(', ') : 'none'}\n` +
      `mood: ${vitals.mood || 'not given'}\n` +
      `temperature_celsius: ${vitals.temperature}\n` +
      `heart_rate_bpm: ${vitals.heartRate}`
    : ''

  const contents = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: message + vitalsLine }] },
  ]

  const url = `${ENDPOINT_BASE}/${MODEL}:generateContent`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents,
      // thinkingBudget 0 stops hidden "thinking" tokens from using up the reply limit
      generationConfig: { temperature: 0.6, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Gemini request failed (${res.status}). ${errBody.slice(0, 200)}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  if (!text) throw new Error('Gemini returned an empty response.')
  return text.trim()
}
