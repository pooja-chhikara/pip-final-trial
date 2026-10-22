import { useEffect, useState } from 'react'
import { listRecords, saveRecord, deleteRecord, explainRecordApi, imageFileToDataUrl } from '../utils/records.js'
import { listReminders, addReminder, patchReminder, deleteReminder } from '../utils/reminders.js'
import { computePatterns } from '../utils/patterns.js'
import { explainPattern } from '../utils/geminiRecords.js'
import { enablePush } from '../utils/push.js'

const LEADS = [
  { label: 'At the time', minutes: 0 },
  { label: '1 hour before', minutes: 60 },
  { label: '1 day before', minutes: 1440 },
  { label: '2 days before', minutes: 2880 },
]

const today = () => new Date().toISOString().slice(0, 10)

export default function HealthVault({ user, history, onClose }) {
  const [tab, setTab] = useState('records')

  return (
    <div className="floating-overlay" onClick={onClose}>
      <div className="floating-window" onClick={(e) => e.stopPropagation()}>
        <div className="d-flex justify-content-between align-items-center border-bottom p-3">
          <div className="d-flex gap-2 flex-wrap">
            {[['records', '📁 Records'], ['reminders', '⏰ Reminders'], ['patterns', '📈 Patterns']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn btn-sm rounded-pill ${tab === id ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
        </div>
        <div className="p-3">
          {tab === 'records' && <RecordsTab user={user} />}
          {tab === 'reminders' && <RemindersTab user={user} />}
          {tab === 'patterns' && <PatternsTab history={history} />}
        </div>
      </div>
    </div>
  )
}

function RecordsTab({ user }) {
  const [records, setRecords] = useState([])
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today())
  const [text, setText] = useState('')
  const [imageData, setImageData] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [explaining, setExplaining] = useState(null)

  async function refresh() {
    try {
      setRecords(await listRecords(user))
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pickImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setImageData(await imageFileToDataUrl(file))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!text.trim() && !imageData) {
      setError('Add some text or a photo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveRecord(user, { title: title.trim() || 'Untitled record', date, text: text.trim(), imageData })
      setTitle(''); setText(''); setImageData(''); setDate(today())
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleExplain(r) {
    setExplaining(r.id)
    setError('')
    try {
      const updated = await explainRecordApi(user, r.id)
      setRecords((list) => list.map((x) => (x.id === r.id ? updated : x)))
      setOpenId(r.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setExplaining(null)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this record?')) return
    await deleteRecord(user, id)
    setRecords((list) => list.filter((r) => r.id !== id))
  }

  return (
    <div>
      <form onSubmit={handleSave} className="mb-3">
        <h6 className="fw-bold">Add a record</h6>
        <div className="row g-2 mb-2">
          <div className="col-8">
            <input className="form-control form-control-sm" placeholder="Title (e.g. Blood test)" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="col-4">
            <input type="date" className="form-control form-control-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <textarea className="form-control form-control-sm mb-2" rows={3} placeholder="Paste report text or notes (optional)" value={text} onChange={(e) => setText(e.target.value)} />
        <input type="file" accept="image/*" className="form-control form-control-sm mb-2" onChange={pickImage} />
        {imageData && <img src={imageData} alt="preview" style={{ maxWidth: '100%', maxHeight: 160 }} className="rounded border mb-2" />}
        {error && <div className="alert alert-danger py-2 small">{error}</div>}
        <button type="submit" className="btn btn-primary btn-sm rounded-pill" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button>
      </form>

      <hr />
      <h6 className="fw-bold">Your records ({records.length})</h6>
      {records.length === 0 && <p className="text-secondary small">Nothing saved yet.</p>}
      <ul className="list-group">
        {records.map((r) => (
          <li key={r.id} className="list-group-item">
            <div className="d-flex justify-content-between align-items-start gap-2">
              <button type="button" className="btn btn-link p-0 text-start text-decoration-none" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <span className="fw-bold small">{r.imageData ? '🖼️' : '📝'} {r.title}</span>
                <span className="text-secondary small d-block">{r.date}</span>
              </button>
              <div className="d-flex gap-1">
                <button type="button" className="btn btn-outline-primary btn-sm rounded-pill" disabled={explaining === r.id} onClick={() => handleExplain(r)}>
                  {explaining === r.id ? 'Reading…' : r.points?.length ? 'Re-read' : 'Read'}
                </button>
                <button type="button" className="btn btn-outline-danger btn-sm rounded-pill" onClick={() => handleDelete(r.id)}>✕</button>
              </div>
            </div>
            {openId === r.id && (
              <div className="mt-2">
                {r.imageData && <img src={r.imageData} alt={r.title} style={{ maxWidth: '100%' }} className="rounded border mb-2" />}
                {r.text && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{r.text}</p>}
                {r.points?.length > 0 && (
                  <ul className="small mb-0 ps-3">
                    {r.points.map((pt, i) => <li key={i}>{pt}</li>)}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-secondary small mt-3 mb-0">Explanations are for understanding only, not a diagnosis. Always confirm with your doctor.</p>
    </div>
  )
}

function RemindersTab({ user }) {
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [doctor, setDoctor] = useState('')
  const [when, setWhen] = useState('')
  const [lead, setLead] = useState(1440)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [pushMsg, setPushMsg] = useState('')

  async function refresh() {
    try {
      setItems(await listReminders(user.uid))
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    const visitAt = new Date(when).getTime()
    if (!title.trim() || !visitAt) {
      setError('Add a title and the visit date and time.')
      return
    }
    try {
      await addReminder(user.uid, { title: title.trim(), doctor: doctor.trim(), visitAt, leadMinutes: lead, notes: notes.trim() })
      setTitle(''); setDoctor(''); setWhen(''); setNotes('')
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleEnablePush() {
    setPushMsg('')
    try {
      await enablePush(user.uid)
      setPushMsg('Alerts are on for this device.')
    } catch (err) {
      setPushMsg(err.message)
    }
  }

  const now = Date.now()
  const upcoming = items.filter((r) => !r.done && r.visitAt >= now)
  const past = items.filter((r) => r.done || r.visitAt < now)

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <button type="button" className="btn btn-outline-primary btn-sm rounded-pill" onClick={handleEnablePush}>🔔 Turn on alerts on this device</button>
        {pushMsg && <span className="small text-secondary">{pushMsg}</span>}
      </div>

      <form onSubmit={handleAdd} className="mb-3">
        <h6 className="fw-bold">Next doctor visit</h6>
        <input className="form-control form-control-sm mb-2" placeholder="Reason (e.g. Follow-up, dentist)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="form-control form-control-sm mb-2" placeholder="Doctor / clinic (optional)" value={doctor} onChange={(e) => setDoctor(e.target.value)} />
        <div className="row g-2 mb-2">
          <div className="col-7">
            <input type="datetime-local" className="form-control form-control-sm" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="col-5">
            <select className="form-select form-select-sm" value={lead} onChange={(e) => setLead(Number(e.target.value))}>
              {LEADS.map((l) => <option key={l.minutes} value={l.minutes}>{l.label}</option>)}
            </select>
          </div>
        </div>
        <input className="form-control form-control-sm mb-2" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <div className="alert alert-danger py-2 small">{error}</div>}
        <button type="submit" className="btn btn-primary btn-sm rounded-pill">Add reminder</button>
      </form>

      <h6 className="fw-bold">Upcoming</h6>
      {upcoming.length === 0 && <p className="text-secondary small">No upcoming visits.</p>}
      <ul className="list-group mb-3">
        {upcoming.map((r) => (
          <ReminderRow key={r.id} r={r} onDone={async () => { await patchReminder(user.uid, r.id, { done: true }); refresh() }} onDelete={async () => { await deleteReminder(user.uid, r.id); refresh() }} />
        ))}
      </ul>
      {past.length > 0 && (
        <>
          <h6 className="fw-bold text-secondary">Past</h6>
          <ul className="list-group">
            {past.map((r) => (
              <ReminderRow key={r.id} r={r} past onDelete={async () => { await deleteReminder(user.uid, r.id); refresh() }} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ReminderRow({ r, past, onDone, onDelete }) {
  return (
    <li className="list-group-item d-flex justify-content-between align-items-center gap-2">
      <div>
        <div className={`fw-bold small ${past ? 'text-secondary' : ''}`}>{r.title}{r.doctor ? ` · ${r.doctor}` : ''}</div>
        <div className="text-secondary small">{new Date(r.visitAt).toLocaleString()}</div>
        {r.notes && <div className="small">{r.notes}</div>}
      </div>
      <div className="d-flex gap-1">
        {!past && onDone && <button type="button" className="btn btn-outline-success btn-sm rounded-pill" onClick={onDone}>Done</button>}
        <button type="button" className="btn btn-outline-danger btn-sm rounded-pill" onClick={onDelete}>✕</button>
      </div>
    </li>
  )
}

function PatternsTab({ history }) {
  const { insights, stats } = computePatterns(history)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleExplain() {
    setLoading(true)
    setError('')
    try {
      setText(await explainPattern({ insights, stats }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!stats) return <p className="text-secondary small">Log a few check-ins and patterns will appear here.</p>

  const series = stats.series
  const temps = series.map((s) => s.temperature)
  const lo = Math.min(...temps, 36), hi = Math.max(...temps, 38)
  const W = 300, H = 80
  const pts = series.map((s, i) => `${series.length > 1 ? (i / (series.length - 1)) * W : W / 2},${H - ((s.temperature - lo) / (hi - lo)) * H}`).join(' ')

  return (
    <div>
      <h6 className="fw-bold">What your check-ins show</h6>
      <ul className="small">
        {insights.map((t, i) => <li key={i}>{t}</li>)}
      </ul>

      <h6 className="fw-bold mt-3">Temperature, last {series.length} check-ins</h6>
      <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="w-100 border rounded bg-light" role="img" aria-label="Temperature trend">
        <polyline points={pts} fill="none" stroke="#0d6efd" strokeWidth="2" />
      </svg>
      <div className="d-flex justify-content-between text-secondary small"><span>{lo.toFixed(1)}°C</span><span>{hi.toFixed(1)}°C</span></div>

      <div className="mt-3">
        {text ? (
          <div className="alert alert-info small" style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
        ) : (
          <button type="button" className="btn btn-outline-primary btn-sm rounded-pill" onClick={handleExplain} disabled={loading}>
            {loading ? 'Thinking…' : '✨ Explain this pattern'}
          </button>
        )}
        {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
      </div>
      <p className="text-secondary small mt-3 mb-0">These are observations, not a diagnosis.</p>
    </div>
  )
}

