import { ref, set, get, remove, update } from 'firebase/database'
import { db } from '../firebase.js'

const base = (uid) => `users/${uid}/reminders`

function requireDb() {
  if (!db) throw new Error('Firebase Realtime Database is not set up (missing VITE_FIREBASE_DATABASE_URL).')
}

export async function listReminders(uid) {
  if (!db || !uid) return []
  const snap = await get(ref(db, base(uid)))
  if (!snap.exists()) return []
  return Object.values(snap.val()).sort((a, b) => a.visitAt - b.visitAt)
}

// visitAt and leadMinutes -> remindAt is what the server and the app both watch.
export async function addReminder(uid, { title, doctor, visitAt, leadMinutes, notes }) {
  requireDb()
  const r = {
    id: crypto.randomUUID(),
    title,
    doctor: doctor || '',
    notes: notes || '',
    visitAt,
    leadMinutes,
    remindAt: visitAt - leadMinutes * 60000,
    notified: false, // in-app / browser alert shown
    pushed: false, // server push sent by the Cloud Function
    done: false,
    createdAt: Date.now(),
  }
  await set(ref(db, `${base(uid)}/${r.id}`), r)
  return r
}

export async function patchReminder(uid, id, fields) {
  requireDb()
  await update(ref(db, `${base(uid)}/${id}`), fields)
}

export async function deleteReminder(uid, id) {
  requireDb()
  await remove(ref(db, `${base(uid)}/${id}`))
}

// Each browser/device that enables push stores its token here; the Cloud Function reads them.
export async function saveFcmToken(uid, token) {
  requireDb()
  await set(ref(db, `users/${uid}/fcmTokens/${token.replace(/[.#$[\]/]/g, '_')}`), { token, updatedAt: Date.now() })
}

// Create or update a reminder with a fixed id (used for clinic appointments).
// If the appointment time changed, alert flags are reset so the user is reminded again.
export async function upsertReminder(uid, r) {
  requireDb()
  const node = ref(db, `${base(uid)}/${r.id}`)
  const snap = await get(node)
  const old = snap.exists() ? snap.val() : null
  const same = old && old.visitAt === r.visitAt
  await set(node, {
    notified: same ? old.notified : false,
    pushed: same ? old.pushed : false,
    done: r.cancelled ? true : old && same ? old.done : false,
    createdAt: old?.createdAt || Date.now(),
    ...r,
  })
}
