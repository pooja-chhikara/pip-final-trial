// Pretend "doctor side" system: 10 dummy patients, each with prescriptions and appointments.
// Dates are computed from today, so the next appointment is always in the future.
//  - /doctor-api/v1/...  : what a clinic's system would expose (needs header x-api-key)
//  - /api/clinic/...     : what the Pip app calls to link and sync a patient
const express = require('express')

const DOCTOR_API_KEY = process.env.DOCTOR_API_KEY || 'demo-doctor-key'

const IST_DAY = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

// med = [name, dose, frequency, timing, duration]
const PATIENTS = [
  { id: 'PT-1001', name: 'Aarav Mehta', age: 34, gender: 'M', clinic: 'City Care Clinic', doctor: 'Dr. A. Sharma',
    rx: [{ ago: 3, meds: [['Paracetamol', '500 mg', 'twice a day', 'after food', '3 days'], ['ORS', '1 sachet', 'as needed', null, '3 days']], advice: ['Rest', 'Drink plenty of fluids'], followUp: 'Review in 1 week if not better' }],
    appts: [{ in: 3, time: '11:00', reason: 'Fever follow-up' }] },
  { id: 'PT-1002', name: 'Diya Nair', age: 29, gender: 'F', clinic: 'Lakeview Diabetes Centre', doctor: 'Dr. R. Iyer',
    rx: [{ ago: 20, meds: [['Metformin', '500 mg', 'twice a day', 'after food', '30 days'], ['Vitamin D3', '60000 IU', 'once a week', null, '8 weeks']], advice: ['Low sugar diet', 'Walk 30 minutes daily'], followUp: 'Review with fasting sugar report' }],
    appts: [{ in: -20, time: '10:00', reason: 'Diabetes check', status: 'completed' }, { in: 6, time: '09:30', reason: 'Diabetes review. Bring fasting sugar report' }] },
  { id: 'PT-1003', name: 'Rohan Verma', age: 52, gender: 'M', clinic: 'Heart & BP Clinic', doctor: 'Dr. S. Kulkarni',
    rx: [{ ago: 28, meds: [['Amlodipine', '5 mg', 'once a day', 'morning', '30 days'], ['Atorvastatin', '10 mg', 'once a day', 'at night', '30 days']], advice: ['Less salt', 'Check BP every morning'], followUp: 'BP check in 1 month' }],
    appts: [{ in: 1, time: '17:00', reason: 'BP check' }] },
  { id: 'PT-1004', name: 'Ananya Iyer', age: 8, gender: 'F', clinic: 'Little Steps Paediatrics', doctor: 'Dr. P. Menon',
    rx: [{ ago: 7, meds: [['Salbutamol inhaler', '2 puffs', 'when wheezing', null, '2 weeks'], ['Montelukast', '4 mg', 'once a day', 'at night', '2 weeks']], advice: ['Avoid dust', 'Carry the inhaler to school'], followUp: 'Asthma review in 2 weeks' }],
    appts: [{ in: 10, time: '16:00', reason: 'Asthma review' }] },
  { id: 'PT-1005', name: 'Kabir Singh', age: 41, gender: 'M', clinic: 'OrthoPlus', doctor: 'Dr. N. Bhatia',
    rx: [{ ago: 5, meds: [['Aceclofenac', '100 mg', 'twice a day', 'after food', '5 days'], ['Calcium', '500 mg', 'once a day', 'after lunch', '30 days']], advice: ['Physiotherapy 3 times a week', 'Avoid heavy lifting'], followUp: 'Review after physio' }],
    appts: [{ in: 2, time: '18:30', reason: 'Physio progress review' }] },
  { id: 'PT-1006', name: 'Meera Joshi', age: 36, gender: 'F', clinic: 'Thyroid & Wellness', doctor: 'Dr. V. Rao',
    rx: [{ ago: 40, meds: [['Levothyroxine', '50 mcg', 'once a day', 'empty stomach in the morning', '3 months']], advice: ['Take 30 minutes before breakfast'], followUp: 'Repeat thyroid test, then review' }],
    appts: [{ in: 14, time: '10:00', reason: 'Thyroid test review' }] },
  { id: 'PT-1007', name: 'Imran Shaikh', age: 47, gender: 'M', clinic: 'Sunrise Dental', doctor: 'Dr. T. Dsouza',
    rx: [{ ago: 2, meds: [['Amoxicillin', '500 mg', 'three times a day', 'after food', '5 days'], ['Chlorhexidine mouthwash', '10 ml', 'twice a day', null, '7 days']], advice: ['Avoid hard food on the left side'], followUp: 'Root canal follow-up' }],
    appts: [{ in: 4, time: '12:15', reason: 'Root canal follow-up' }] },
  { id: 'PT-1008', name: 'Sneha Kulkarni', age: 31, gender: 'F', clinic: 'MotherCare Hospital', doctor: 'Dr. L. Fernandes',
    rx: [{ ago: 14, meds: [['Folic acid', '5 mg', 'once a day', null, '3 months'], ['Iron and folic acid tablet', '1 tablet', 'once a day', 'after food', '30 days']], advice: ['Balanced diet', 'Light walking'], followUp: 'Antenatal check-up with scan' }],
    appts: [{ in: 7, time: '15:00', reason: 'Antenatal check-up and scan' }] },
  { id: 'PT-1009', name: 'Vikram Rao', age: 58, gender: 'M', clinic: 'ClearView Eye Care', doctor: 'Dr. M. Pillai',
    rx: [{ ago: 9, meds: [['Moxifloxacin eye drops', '1 drop', '4 times a day', null, '7 days'], ['Lubricant eye drops', '1 drop', '3 times a day', null, '30 days']], advice: ['Do not rub the eye', 'Wear the protective shield at night'], followUp: 'Post-surgery check' }],
    appts: [{ in: 5, time: '11:30', reason: 'Post-cataract surgery check' }] },
  { id: 'PT-1010', name: 'Nisha Patel', age: 24, gender: 'F', clinic: 'DermaCare Skin Clinic', doctor: 'Dr. K. Bose',
    rx: [{ ago: 21, meds: [['Adapalene gel', 'pea-sized amount', 'once a day', 'at night', '8 weeks'], ['Doxycycline', '100 mg', 'once a day', 'after food', '4 weeks']], advice: ['Use sunscreen SPF 30 every morning', 'Do not pick pimples'], followUp: 'Acne treatment review' }],
    appts: [{ in: 8, time: '14:00', reason: 'Acne treatment review' }] },
]

const emailOf = (p) => p.name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.') + '@example.com'

const medLine = ([name, dose, freq, timing, dur]) =>
  `${name} ${dose}: ${[freq, timing].filter(Boolean).join(' ')}${dur ? ' for ' + dur : ''}.`

function patientView(p) {
  return { patientId: p.id, name: p.name, age: p.age, gender: p.gender, email: emailOf(p), clinic: p.clinic, doctor: p.doctor, dummy: true }
}

function prescriptionsOf(p) {
  return p.rx.map((r, i) => ({
    prescriptionId: `RX-${p.id.slice(3)}-${i + 1}`,
    patientId: p.id,
    doctor: p.doctor,
    clinic: p.clinic,
    date: IST_DAY(-r.ago),
    medicines: r.meds.map(([name, dose, frequency, timing, duration]) => ({ name, dose, frequency, timing, duration })),
    advice: r.advice,
    followUpText: r.followUp,
    followUpDate: p.appts.find((a) => a.in > 0) ? IST_DAY(p.appts.find((a) => a.in > 0).in) : null,
    simplified: [...r.meds.map(medLine), 'Advice: ' + r.advice.join('; ') + '.', 'Next visit: ' + r.followUp + '.'],
    status: 'active',
  }))
}

function appointmentsOf(p) {
  return p.appts.map((a, i) => {
    const date = IST_DAY(a.in)
    return {
      appointmentId: `AP-${p.id.slice(3)}-${i + 1}`,
      patientId: p.id,
      doctor: p.doctor,
      clinic: p.clinic,
      reason: a.reason,
      date,
      time: a.time,
      startsAt: `${date}T${a.time}:00+05:30`,
      status: a.status || 'confirmed', // confirmed | completed | cancelled | rescheduled
    }
  })
}

const find = (id) => PATIENTS.find((p) => p.id === String(id).toUpperCase())

// ---- what the doctor's system exposes ----
const doctorApi = express.Router()
doctorApi.use((req, res, next) => {
  if (req.get('x-api-key') !== DOCTOR_API_KEY) return res.status(401).json({ error: 'Missing or wrong x-api-key.' })
  next()
})
doctorApi.get('/patients', (_req, res) => res.json(PATIENTS.map(patientView)))
doctorApi.get('/patients/:id', (req, res) => {
  const p = find(req.params.id)
  return p ? res.json(patientView(p)) : res.status(404).json({ error: 'Patient not found.' })
})
doctorApi.get('/patients/:id/prescriptions', (req, res) => {
  const p = find(req.params.id)
  return p ? res.json(prescriptionsOf(p)) : res.status(404).json({ error: 'Patient not found.' })
})
doctorApi.get('/patients/:id/appointments', (req, res) => {
  const p = find(req.params.id)
  if (!p) return res.status(404).json({ error: 'Patient not found.' })
  let list = appointmentsOf(p)
  if (req.query.status) list = list.filter((a) => a.status === req.query.status)
  if (req.query.upcoming === 'true') list = list.filter((a) => a.startsAt >= new Date().toISOString())
  res.json(list)
})
// For automation: every upcoming appointment across all patients, e.g. ?withinDays=7
doctorApi.get('/appointments/upcoming', (req, res) => {
  const days = Math.min(Number(req.query.withinDays) || 30, 365)
  const limit = IST_DAY(days)
  const out = PATIENTS.flatMap(appointmentsOf).filter((a) => a.status !== 'completed' && a.date >= IST_DAY(0) && a.date <= limit)
  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  res.json(out)
})

// ---- what the Pip app calls (no key in the browser) ----
const appApi = express.Router()
appApi.get('/patients/:id', (req, res) => {
  const p = find(req.params.id)
  if (!p) return res.status(404).json({ error: 'No patient with that code.' })
  res.json({ patientId: p.id, name: p.name, clinic: p.clinic, doctor: p.doctor })
})
appApi.get('/patients/:id/sync', (req, res) => {
  const p = find(req.params.id)
  if (!p) return res.status(404).json({ error: 'No patient with that code.' })
  res.json({ patient: patientView(p), prescriptions: prescriptionsOf(p), appointments: appointmentsOf(p) })
})

module.exports = { doctorApi, appApi }
