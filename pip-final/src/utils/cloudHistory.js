import { ref, set, get, remove } from 'firebase/database'
import { db } from '../firebase.js'

const historyPath = (uid) => `users/${uid}/history`

// Save one check-in under users/<uid>/history/<id>. Never throws (local copy still exists).
export async function saveCheckInToCloud(uid, record) {
  if (!db || !uid) return
  try {
    await set(ref(db, `${historyPath(uid)}/${record.id}`), record)
  } catch (err) {
    console.error('Could not save check-in to Firebase:', err)
  }
}

// Returns an array of check-ins (newest first), or [] if unavailable.
export async function loadHistoryFromCloud(uid) {
  if (!db || !uid) return []
  try {
    const snap = await get(ref(db, historyPath(uid)))
    if (!snap.exists()) return []
    return Object.values(snap.val()).map((e) => ({ ...e, symptoms: e.symptoms || [] }))
  } catch (err) {
    console.error('Could not load history from Firebase:', err)
    return []
  }
}

export async function clearCloudHistory(uid) {
  if (!db || !uid) return
  try {
    await remove(ref(db, historyPath(uid)))
  } catch (err) {
    console.error('Could not clear cloud history:', err)
  }
}

// Merge two lists by id, newest first.
export function mergeHistory(a, b) {
  const map = new Map()
  ;[...a, ...b].forEach((e) => map.set(e.id, e))
  return [...map.values()].sort((x, y) => new Date(y.date) - new Date(x.date))
}
