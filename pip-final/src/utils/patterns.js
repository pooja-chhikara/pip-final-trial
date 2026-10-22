const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const DAY = 86400000

// Turns saved check-ins into plain-language observations. Not a diagnosis.
export function computePatterns(history = []) {
  const items = [...history].sort((a, b) => new Date(a.date) - new Date(b.date))
  if (items.length === 0) return { insights: [], stats: null }

  const now = Date.now()
  const recent = items.filter((e) => now - new Date(e.date) <= 7 * DAY)
  const earlier = items.filter((e) => now - new Date(e.date) > 7 * DAY)

  const counts = {}
  items.forEach((e) => (e.symptoms || []).forEach((s) => (counts[s] = (counts[s] || 0) + 1)))
  const topSymptoms = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const temps = items.map((e) => e.temperature).filter(Number.isFinite)
  const hrs = items.map((e) => e.heartRate).filter(Number.isFinite)
  const rt = avg(recent.map((e) => e.temperature).filter(Number.isFinite))
  const et = avg(earlier.map((e) => e.temperature).filter(Number.isFinite))
  const rh = avg(recent.map((e) => e.heartRate).filter(Number.isFinite))
  const eh = avg(earlier.map((e) => e.heartRate).filter(Number.isFinite))

  const insights = []
  insights.push(`${items.length} check-in${items.length > 1 ? 's' : ''} logged, ${recent.length} in the last 7 days.`)
  if (topSymptoms.length) {
    insights.push('Most frequent symptoms: ' + topSymptoms.map(([s, n]) => `${s} (${n}x)`).join(', ') + '.')
  }
  if (rt != null && et != null && Math.abs(rt - et) >= 0.3) {
    insights.push(`Temperature is ${rt > et ? 'higher' : 'lower'} this week (${rt.toFixed(1)}°C vs ${et.toFixed(1)}°C before).`)
  }
  if (rh != null && eh != null && Math.abs(rh - eh) >= 8) {
    insights.push(`Resting heart rate is ${rh > eh ? 'higher' : 'lower'} this week (${Math.round(rh)} vs ${Math.round(eh)} bpm before).`)
  }
  const feverDays = new Set(items.filter((e) => e.temperature >= 37.8).map((e) => new Date(e.date).toDateString()))
  if (feverDays.size >= 2) insights.push(`Temperature was 37.8°C or higher on ${feverDays.size} different days.`)
  const urgent = items.filter((e) => e.insight?.urgency === 'urgent').length
  if (urgent) insights.push(`${urgent} check-in${urgent > 1 ? 's were' : ' was'} marked urgent. Consider mentioning this to a doctor.`)
  // repeated symptom on 3+ days
  const bySymptomDays = {}
  items.forEach((e) => (e.symptoms || []).forEach((s) => (bySymptomDays[s] ||= new Set()).add(new Date(e.date).toDateString())))
  Object.entries(bySymptomDays).filter(([, d]) => d.size >= 3).forEach(([s, d]) => insights.push(`"${s}" showed up on ${d.size} different days. Worth raising at your next visit.`))

  return {
    insights,
    stats: {
      avgTemp: avg(temps), avgHr: avg(hrs), topSymptoms,
      series: items.slice(-14).map((e) => ({ date: e.date, temperature: e.temperature, heartRate: e.heartRate })),
    },
  }
}
