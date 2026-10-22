import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import app from '../firebase.js'
import { saveFcmToken } from './reminders.js'

// Registers this browser for push alerts (works even when the app tab is closed).
// Needs VITE_FIREBASE_VAPID_KEY (Firebase console -> Project settings -> Cloud Messaging -> Web Push certificates).
export async function enablePush(uid) {
  if (!(await isSupported())) throw new Error('Push notifications are not supported in this browser.')
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) throw new Error('Missing VITE_FIREBASE_VAPID_KEY in .env.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were blocked. Allow them in your browser settings.')

  const cfg = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  })
  const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${cfg}`)
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg })
  if (!token) throw new Error('Could not get a push token.')
  await saveFcmToken(uid, token)
  return token
}
