// Talks to the Pip Health API (hosted on Render). Set VITE_API_URL in .env, e.g. https://pip-health-api.onrender.com
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export async function api(user, path, options = {}) {
  if (!BASE) throw new Error('Missing VITE_API_URL in .env (your Render URL).')
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'x-user-id': user?.uid || 'demo', ...(options.headers || {}) },
    })
  } catch {
    throw new Error('Could not reach the server. On the free Render plan it can take about a minute to wake up. Try again shortly.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Server error (${res.status}).`)
  return data
}
