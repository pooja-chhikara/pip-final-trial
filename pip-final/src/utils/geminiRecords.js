const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const SYSTEM = `You help a person understand their own medical records in plain, calm language.
Rules: you are NOT a doctor. Do not diagnose, prescribe, or change doses. Explain what terms and values mean,
point out values marked abnormal in the document, and list 2-4 good questions to ask their doctor.
Use short headings and bullets. Say clearly when the image or text is unreadable. End with one line telling them to confirm with their doctor.`

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash'

async function call({ parts }) {
  if (!API_KEY) throw new Error('Explanations are not set up yet.')
  const res = await fetch(`${ENDPOINT_BASE}/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  if (!res.ok) throw new Error(`Gemini request failed (${res.status}). ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  if (!text) throw new Error('Gemini returned an empty response.')
  return text.trim()
}

export function explainPattern({ insights, stats }) {
  return call({
    parts: [{ text:
      'These are automatically computed observations from a person\'s own health check-ins. Explain in plain language what the pattern may suggest, ' +
      'what is probably normal, and what to mention to a doctor.\n\n' + insights.join('\n') +
      (stats ? `\n\nAverage temperature: ${stats.avgTemp?.toFixed(1)} C, average heart rate: ${Math.round(stats.avgHr)} bpm.` : '') }],
  })
}
