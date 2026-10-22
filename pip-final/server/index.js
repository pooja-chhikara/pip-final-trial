// Pip Health API: dummy records + prescription image reading.
// Data lives in memory (resets on restart) and is seeded with dummy data per user.
const express = require('express')
const cors = require('cors')

const PORT = process.env.PORT || 3001
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta/models'
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

const app = express()
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',') }))
app.use(express.json({ limit: '8mb' }))

// ---------- dummy data ----------
const stores = new Map() // userId -> { records: [], prescriptions: [] }

function seed() {
  const day = 86400000
  const iso = (d) => new Date(Date.now() - d * day).toISOString().slice(0, 10)
  return {
    records: [
      {
        id: 'rec-1', title: 'Blood test (CBC)', date: iso(30), createdAt: Date.now() - 30 * day,
        text: 'Hemoglobin 11.2 g/dL (L)\nWBC 6,800 /uL\nPlatelets 2.4 lakh /uL\nVitamin D 18 ng/mL (L)',
        points: ['Hemoglobin is a little low (11.2 g/dL). Can point to mild anaemia.', 'Vitamin D is low (18 ng/mL).', 'WBC and platelets are in the normal range.', 'Ask the doctor: do I need iron or vitamin D supplements?'],
      },
      {
        id: 'rec-2', title: 'Fever visit notes', date: iso(12), createdAt: Date.now() - 12 * day,
        text: 'Viral fever, 3 days. Temp 38.4 C. Advised rest, fluids, paracetamol if above 38 C. Review in 1 week if not better.',
        points: ['Doctor thinks it was a viral fever.', 'Rest and plenty of fluids advised.', 'Paracetamol only when temperature is above 38 C.', 'Go back if not better in a week.'],
      },
      { id: 'rec-3', title: 'Vaccination card', date: iso(90), createdAt: Date.now() - 90 * day, text: 'Typhoid booster given. Next due: 3 years.', points: [] },
    ],
    prescriptions: [
      {
        id: 'rx-1', title: 'Prescription: fever visit', date: iso(12), createdAt: Date.now() - 12 * day, demo: true,
        doctor: 'Dr. A. Sharma', imageData: '',
        medicines: [
          { name: 'Paracetamol', dose: '500 mg', how: '1 tablet, only if fever above 38 C', duration: '3 days' },
          { name: 'ORS', dose: '1 sachet', how: 'in 1 litre water, sip through the day', duration: '3 days' },
        ],
        advice: ['Rest', 'Drink plenty of fluids', 'Review in 1 week if not better'],
        points: [
          'Doctor: Dr. A. Sharma',
          'Paracetamol 500 mg: 1 tablet only if fever is above 38 C, for 3 days.',
          'ORS: 1 sachet in 1 litre water, sip through the day, 3 days.',
          'Advice: rest, fluids. Review in 1 week if not better.',
        ],
      },
    ],
  }
}

function storeFor(req) {
  const uid = String(req.get('x-user-id') || 'demo').slice(0, 128)
  if (!stores.has(uid)) stores.set(uid, seed())
  return stores.get(uid)
}

// ---------- Gemini ----------
async function gemini({ system, parts, schemaHint }) {
  const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1500,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Gemini returned unreadable output. Expected ${schemaHint}.`)
  }
}

const RX_SYSTEM = `You read photos of medical prescriptions. Report only what is written. Never guess an unreadable word: use null for it.
Be brief and exact. No extra advice, no diagnosis, no warnings beyond what the prescription says.
Return JSON: {"readable": boolean, "doctor": string|null, "date": string|null,
"medicines": [{"name": string, "dose": string|null, "how": string|null, "duration": string|null}],
"advice": [string]}.
"how" means frequency and timing (e.g. "1 tablet twice daily after food"). Keep each item under 15 words.`

const EXPLAIN_SYSTEM = `You explain a person's medical record in plain language. Be point to point, no exaggeration, no diagnosis, no prescribing.
Return JSON: {"points": [string]} with at most 5 short points (under 20 words each):
what it says, anything marked abnormal, and one question to ask the doctor. If unreadable, return one point saying so.`

function splitDataUrl(dataUrl) {
  const m = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(dataUrl || '')
  if (!m) return null
  return { mimeType: m[1], data: m[2] }
}

// ---- structured prescription (the shape a doctor's office / chemist integration can consume later) ----
const RX_READ_SYSTEM = `You read photos of medical prescriptions and make them simple. Report only what is written. Never guess an unreadable word: use null.
No diagnosis, no extra medical advice, no warnings that are not on the prescription.
Return JSON:
{"readable": boolean,
 "doctor": string|null, "clinic": string|null, "patient": string|null, "date": "YYYY-MM-DD"|null,
 "medicines": [{"name": string, "dose": string|null, "frequency": string|null, "timing": string|null, "duration": string|null}],
 "advice": [string],
 "followUpText": string|null,
 "followUpDate": "YYYY-MM-DD"|null,
 "simplified": [string]}
frequency = how often (e.g. "twice a day"); timing = relation to food/time (e.g. "after food", "at night").
followUpDate only if an exact calendar date is written; otherwise null and put the wording in followUpText.
simplified = 3 to 6 plain-language points a patient can follow, e.g. "Paracetamol 500 mg: 1 tablet twice a day after food for 3 days." Each under 20 words.`

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null)
const isoDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

function normalizeRx(out) {
  const medicines = (Array.isArray(out.medicines) ? out.medicines : [])
    .filter((m) => m && str(m.name))
    .slice(0, 30)
    .map((m) => ({ name: str(m.name), dose: str(m.dose), frequency: str(m.frequency), timing: str(m.timing), duration: str(m.duration) }))
  const list = (a) => (Array.isArray(a) ? a.map(str).filter(Boolean).slice(0, 10) : [])
  return {
    schemaVersion: 1,
    readable: out.readable !== false,
    doctor: str(out.doctor), clinic: str(out.clinic), patient: str(out.patient), date: isoDate(out.date),
    medicines, advice: list(out.advice),
    followUpText: str(out.followUpText), followUpDate: isoDate(out.followUpDate),
    simplified: list(out.simplified),
  }
}

function rxToPoints(r) {
  const pts = []
  if (r.doctor) pts.push(`Doctor: ${r.doctor}`)
  ;(r.medicines || []).forEach((m) => {
    const bits = [m.dose, m.how, m.duration ? `for ${m.duration}` : null].filter(Boolean).join(', ')
    pts.push(`${m.name}${bits ? ': ' + bits : ''}.`)
  })
  if (r.advice?.length) pts.push('Advice: ' + r.advice.join('; ') + '.')
  return pts
}

const clinic = require('./clinic')
app.use('/doctor-api/v1', clinic.doctorApi)
app.use('/api/clinic', clinic.appApi)

// ---------- routes ----------
app.get('/health', (_req, res) => res.json({ ok: true, gemini: Boolean(GEMINI_API_KEY) }))

app.get('/api/records', (req, res) => res.json(storeFor(req).records))

app.post('/api/records', (req, res) => {
  const { title, date, text, imageData } = req.body || {}
  if (!text && !imageData) return res.status(400).json({ error: 'Add some text or an image.' })
  const rec = {
    id: 'rec-' + Math.random().toString(36).slice(2, 10),
    title: (title || 'Untitled record').toString().slice(0, 120),
    date: date || new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
    text: (text || '').toString().slice(0, 20000),
    imageData: imageData || '',
    points: [],
  }
  storeFor(req).records.unshift(rec)
  res.status(201).json(rec)
})

app.delete('/api/records/:id', (req, res) => {
  const s = storeFor(req)
  s.records = s.records.filter((r) => r.id !== req.params.id)
  res.json({ ok: true })
})

// Short bullet-point explanation of a record
app.post('/api/records/:id/explain', async (req, res) => {
  const rec = storeFor(req).records.find((r) => r.id === req.params.id)
  if (!rec) return res.status(404).json({ error: 'Record not found.' })
  if (!GEMINI_API_KEY) {
    rec.points = rec.points.length ? rec.points : ['Demo mode: the server has no GEMINI_API_KEY, so this record cannot be read yet.']
    return res.json(rec)
  }
  try {
    const parts = [{ text: `Record title: ${rec.title}\n${rec.text || ''}` }]
    const img = splitDataUrl(rec.imageData)
    if (img) parts.push({ inlineData: img })
    const out = await gemini({ system: EXPLAIN_SYSTEM, parts, schemaHint: '{"points":[...]}' })
    rec.points = (out.points || []).slice(0, 5)
    res.json(rec)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// Reads one prescription photo and returns the structured, simplified result. Nothing is stored here:
// the app saves the result to Firebase under the signed-in user.
app.post('/api/prescriptions/read', async (req, res) => {
  const img = splitDataUrl(req.body?.imageData)
  if (!img) return res.status(400).json({ error: 'Send imageData as a base64 image data URL.' })

  if (!GEMINI_API_KEY) {
    return res.json({
      schemaVersion: 1, demo: true, readable: true,
      doctor: 'Dr. A. Sharma', clinic: 'City Care Clinic', patient: null, date: new Date().toISOString().slice(0, 10),
      medicines: [
        { name: 'Paracetamol', dose: '500 mg', frequency: 'twice a day', timing: 'after food', duration: '3 days' },
        { name: 'ORS', dose: '1 sachet', frequency: 'as needed', timing: null, duration: '3 days' },
      ],
      advice: ['Rest', 'Drink plenty of fluids'],
      followUpText: 'Review in 1 week if not better', followUpDate: null,
      simplified: [
        'Paracetamol 500 mg: 1 tablet twice a day after food for 3 days.',
        'ORS: 1 sachet in water as needed for 3 days.',
        'Rest and drink plenty of fluids.',
        'Go back in 1 week if not better.',
      ],
    })
  }
  try {
    const out = await gemini({
      system: RX_READ_SYSTEM,
      parts: [{ text: 'Read this prescription.' }, { inlineData: img }],
      schemaHint: 'the prescription JSON',
    })
    const rx = normalizeRx(out)
    if (!rx.readable || (!rx.medicines.length && !rx.simplified.length)) {
      return res.status(422).json({ error: 'Could not read this image clearly. Try a sharper, well-lit photo of the whole page.' })
    }
    res.json({ ...rx, demo: false })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

app.get('/api/prescriptions', (req, res) => res.json(storeFor(req).prescriptions))

// Upload a prescription photo (JSON: { title?, imageData: "data:image/jpeg;base64,..." }) and read it
app.post('/api/prescriptions', async (req, res) => {
  const { title, imageData } = req.body || {}
  const img = splitDataUrl(imageData)
  if (!img) return res.status(400).json({ error: 'Send imageData as a base64 image data URL.' })

  const base = {
    id: 'rx-' + Math.random().toString(36).slice(2, 10),
    title: (title || 'Prescription').toString().slice(0, 120),
    date: new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
    imageData,
  }

  if (!GEMINI_API_KEY) {
    const rx = { ...base, demo: true, doctor: null, medicines: [], advice: [], points: ['Demo mode: set GEMINI_API_KEY on the server to read real prescriptions.'] }
    storeFor(req).prescriptions.unshift(rx)
    return res.status(201).json(rx)
  }

  try {
    const out = await gemini({
      system: RX_SYSTEM,
      parts: [{ text: 'Read this prescription.' }, { inlineData: img }],
      schemaHint: 'the prescription JSON',
    })
    const points = out.readable === false ? ['Could not read this image clearly. Try a sharper, well-lit photo.'] : rxToPoints(out)
    const rx = {
      ...base,
      demo: false,
      doctor: out.doctor || null,
      medicines: out.medicines || [],
      advice: out.advice || [],
      points: points.length ? points : ['Nothing readable found in this image.'],
    }
    storeFor(req).prescriptions.unshift(rx)
    res.status(201).json(rx)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

app.delete('/api/prescriptions/:id', (req, res) => {
  const s = storeFor(req)
  s.prescriptions = s.prescriptions.filter((r) => r.id !== req.params.id)
  res.json({ ok: true })
})

app.listen(PORT, () => console.log(`Pip Health API on :${PORT} (gemini ${GEMINI_API_KEY ? 'on' : 'off, demo mode'})`))
