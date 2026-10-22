import { ref, set, get, remove } from 'firebase/database'
import { db } from '../firebase.js'
import { api } from './api.js'

const base = (uid) => `users/${uid}/prescriptions`

function requireDb() {
  if (!db) throw new Error('Firebase Realtime Database is not set up (missing VITE_FIREBASE_DATABASE_URL).')
}

// 1) Gemini (via the Render API) reads and simplifies the photo.
export const readPrescription = (user, imageData) =>
  api(user, '/api/prescriptions/read', { method: 'POST', body: JSON.stringify({ imageData }) })

// 2) The result is saved in Firebase under the signed-in user.
export async function savePrescription(uid, parsed, imageData) {
  requireDb()
  const rx = {
    ...parsed,
    id: crypto.randomUUID(),
    uploadedAt: Date.now(),
    status: 'active', // later: 'sent_to_chemist', 'filled', ...
    imageData,
  }
  await set(ref(db, `${base(uid)}/${rx.id}`), rx)
  return rx
}

export async function listPrescriptions(uid) {
  if (!db || !uid) return []
  const snap = await get(ref(db, base(uid)))
  if (!snap.exists()) return []
  return Object.values(snap.val())
    .map((x) => ({ ...x, medicines: x.medicines || [], advice: x.advice || [], simplified: x.simplified || [] }))
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
}

export async function deletePrescription(uid, id) {
  requireDb()
  await remove(ref(db, `${base(uid)}/${id}`))
}
