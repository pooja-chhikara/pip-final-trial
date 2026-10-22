import { useEffect, useState } from 'react'
import { listReminders, patchReminder } from './reminders.js'

// While the app is open: checks every 30s and shows an in-app banner plus a browser notification.
export default function useReminderAlerts(user) {
  const [due, setDue] = useState([])

  useEffect(() => {
    if (!user) {
      setDue([])
      return undefined
    }
    let stop = false
    async function check() {
      try {
        const now = Date.now()
        const all = await listReminders(user.uid)
        const fresh = all.filter((r) => !r.done && !r.notified && r.remindAt <= now && r.visitAt > now - 86400000)
        if (stop || fresh.length === 0) return
        for (const r of fresh) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Doctor visit reminder', { body: `${r.title}${r.doctor ? ' with ' + r.doctor : ''} at ${new Date(r.visitAt).toLocaleString()}` })
          }
          patchReminder(user.uid, r.id, { notified: true }).catch(() => {})
        }
        setDue((prev) => [...prev, ...fresh])
      } catch {
        /* database not set up: stay quiet */
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [user])

  return { due, dismiss: (id) => setDue((d) => d.filter((r) => r.id !== id)) }
}
