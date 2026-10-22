import { ref, set, get, remove } from 'firebase/database'
import { db } from '../firebase.js'
import { api } from './api.js'
import { upsertReminder } from './reminders.js'

const linkPath = (uid) => `users/${uid}/patientLink`

export async function getLink(uid) {
  if (!db || !uid) return null
  const snap = await get(ref(db, linkPath(uid)))
  return snap.exists() ? snap.val() : null
}

// Looks the code up at the clinic (via the Render API) and stores the link for this user.
export async function linkPatient(user, code) {
  if (!db) throw new Error('Firebase Realtime Database is not set up (missing VITE_FIREBASE_DATABASE_URL).')
  const patient = await api(user, `/api/clinic/patients/${encodeURIComponent(code.trim())}`)
  const link = { patientId: patient.patientId, name: patient.name, clinic: patient.clinic, doctor: patient.doctor, linkedAt: Date.now() }
  await set(ref(db, linkPath(user.uid)), link)
  return link
}

export async function unlinkPatient(uid) {
  await remove(ref(db, linkPath(uid)))
}

// Pulls prescriptions and appointments from the clinic and saves them for this user:
// prescriptions -> users/<uid>/prescriptions, appointments -> users/<uid>/reminders (so alerts work as usual).
export async function syncFromClinic(user, link) {
  const data = await api(user, `/api/clinic/patients/${encodeURIComponent(link.patientId)}/sync`)

  for (const rx of data.prescriptions) {
    await set(ref(db, `users/${user.uid}/prescriptions/clinic-${rx.prescriptionId}`), {
      ...rx,
      id: `clinic-${rx.prescriptionId}`,
      source: 'clinic',
      schemaVersion: 1,
      readable: true,
      uploadedAt: new Date(rx.date).getTime() || Date.now(),
      imageData: '',
    })
  }

  for (const ap of data.appointments) {
    if (ap.status === 'completed') continue
    const visitAt = new Date(ap.startsAt).getTime()
    await upsertReminder(user.uid, {
      id: `clinic-${ap.appointmentId}`,
      source: 'clinic',
      title: ap.reason,
      doctor: `${ap.doctor}, ${ap.clinic}`,
      notes: '',
      visitAt,
      leadMinutes: 1440,
      remindAt: visitAt - 1440 * 60000,
      cancelled: ap.status === 'cancelled',
    })
  }
  return { prescriptions: data.prescriptions.length, appointments: data.appointments.filter((a) => a.status !== 'completed').length }
}
