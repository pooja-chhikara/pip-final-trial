// Sends a push to every device of a user when a doctor-visit reminder becomes due.
// Deploy: firebase deploy --only functions   (needs the Blaze plan)
const { onSchedule } = require('firebase-functions/v2/scheduler')
const admin = require('firebase-admin')
admin.initializeApp()

exports.sendVisitReminders = onSchedule('every 5 minutes', async () => {
  const now = Date.now()
  const snap = await admin.database().ref('users').once('value')
  const users = snap.val() || {}
  const jobs = []

  for (const [uid, u] of Object.entries(users)) {
    const tokens = Object.values(u.fcmTokens || {}).map((t) => t.token).filter(Boolean)
    if (!tokens.length) continue
    for (const r of Object.values(u.reminders || {})) {
      if (r.done || r.pushed || r.remindAt > now || r.visitAt < now - 86400000) continue
      const when = new Date(r.visitAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      jobs.push(
        admin
          .messaging()
          .sendEachForMulticast({
            tokens,
            notification: { title: 'Doctor visit reminder', body: `${r.title}${r.doctor ? ' with ' + r.doctor : ''} - ${when}` },
          })
          .then(() => admin.database().ref(`users/${uid}/reminders/${r.id}/pushed`).set(true))
      )
    }
  }
  await Promise.all(jobs)
})

// Every 30 minutes: for each user linked to a clinic, fetch their appointments from the doctor's API
// and turn them into reminders. sendVisitReminders above then pushes the alert when it is due.
// Set DOCTOR_API_URL and DOCTOR_API_KEY in functions/.env (see README-FILES.md).
exports.syncClinicAppointments = onSchedule('every 30 minutes', async () => {
  const base = (process.env.DOCTOR_API_URL || '').replace(/\/$/, '')
  const key = process.env.DOCTOR_API_KEY
  if (!base || !key) return console.warn('DOCTOR_API_URL / DOCTOR_API_KEY not set')

  const users = (await admin.database().ref('users').once('value')).val() || {}
  for (const [uid, u] of Object.entries(users)) {
    const patientId = u.patientLink && u.patientLink.patientId
    if (!patientId) continue
    try {
      const res = await fetch(`${base}/doctor-api/v1/patients/${patientId}/appointments`, { headers: { 'x-api-key': key } })
      if (!res.ok) continue
      for (const ap of await res.json()) {
        if (ap.status === 'completed') continue
        const id = `clinic-${ap.appointmentId}`
        const node = admin.database().ref(`users/${uid}/reminders/${id}`)
        const old = (await node.once('value')).val()
        const visitAt = new Date(ap.startsAt).getTime()
        const same = old && old.visitAt === visitAt
        await node.set({
          id, source: 'clinic', title: ap.reason, doctor: `${ap.doctor}, ${ap.clinic}`, notes: '',
          visitAt, leadMinutes: 1440, remindAt: visitAt - 1440 * 60000,
          notified: same ? old.notified : false,
          pushed: same ? old.pushed : false,
          done: ap.status === 'cancelled' ? true : same ? old.done : false,
          createdAt: (old && old.createdAt) || Date.now(),
        })
      }
    } catch (e) {
      console.error('clinic sync failed for', uid, e)
    }
  }
})
