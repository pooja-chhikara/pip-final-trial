import { useEffect, useState } from 'react'
import { readPrescription, savePrescription, listPrescriptions, deletePrescription } from '../utils/prescriptions.js'
import { imageFileToDataUrl } from '../utils/records.js'
import { addReminder } from '../utils/reminders.js'
import { getLink, linkPatient, unlinkPatient, syncFromClinic } from '../utils/clinic.js'

// Dashboard section: upload a prescription photo -> Gemini reads and simplifies it -> saved to Firebase -> shown here.
export default function PrescriptionSection({ user, onLoginClick }) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [openImage, setOpenImage] = useState(null)
  const [link, setLink] = useState(null)
  const [code, setCode] = useState('')
  const [syncing, setSyncing] = useState(false)

  async function refresh() {
    if (!user) {
      setItems([])
      return
    }
    try {
      setItems(await listPrescriptions(user.uid))
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => {
    refresh()
    if (!user) {
      setLink(null)
      return
    }
    getLink(user.uid)
      .then((l) => {
        setLink(l)
        if (l) handleSync(l, true)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function handleSync(l = link, quiet = false) {
    setSyncing(true)
    setError('')
    try {
      const n = await syncFromClinic(user, l)
      await refresh()
      if (!quiet) {
        setStatus(`Synced: ${n.prescriptions} prescription(s), ${n.appointments} upcoming appointment(s).`)
        setTimeout(() => setStatus(''), 4000)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleLink(e) {
    e.preventDefault()
    setError('')
    try {
      const l = await linkPatient(user, code)
      setLink(l)
      setCode('')
      await handleSync(l)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleUnlink() {
    await unlinkPatient(user.uid)
    setLink(null)
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    try {
      setStatus('Preparing photo…')
      const imageData = await imageFileToDataUrl(file)
      setStatus('Reading and simplifying with Gemini…')
      const parsed = await readPrescription(user, imageData)
      setStatus('Saving…')
      await savePrescription(user.uid, parsed, imageData)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this prescription?')) return
    await deletePrescription(user.uid, id)
    setItems((l) => l.filter((x) => x.id !== id))
  }

  async function handleRemind(rx) {
    try {
      const visitAt = new Date(`${rx.followUpDate}T10:00`).getTime()
      await addReminder(user.uid, {
        title: `Follow-up${rx.doctor ? ' with ' + rx.doctor : ''}`,
        doctor: rx.clinic || rx.doctor || '',
        visitAt,
        leadMinutes: 1440,
        notes: rx.followUpText || '',
      })
      setStatus('Reminder added. See Health Vault, Reminders.')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section id="prescriptions" className="container py-4">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <h4 className="mb-0">💊 My prescriptions</h4>
          <p className="text-secondary small mb-0">Upload a photo. Pip reads it and shows it in simple points.</p>
        </div>
        {user ? (
          <label className={`btn btn-primary rounded-pill mb-0 ${busy ? 'disabled' : ''}`}>
            {busy ? 'Working…' : '＋ Upload prescription'}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={handleFile} />
          </label>
        ) : (
          <button type="button" className="btn btn-outline-primary rounded-pill" onClick={onLoginClick}>Log in to upload</button>
        )}
      </div>

      {user && (
        <div className="card border-0 bg-light mb-3">
          <div className="card-body py-2 px-3 small">
            {link ? (
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span>🏥 Linked to <strong>{link.clinic}</strong> as <strong>{link.name}</strong> ({link.patientId}). Appointments become reminders automatically.</span>
                <span className="d-flex gap-2">
                  <button type="button" className="btn btn-outline-primary btn-sm rounded-pill" disabled={syncing} onClick={() => handleSync()}>
                    {syncing ? 'Syncing…' : 'Sync now'}
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm rounded-pill" onClick={handleUnlink}>Unlink</button>
                </span>
              </div>
            ) : (
              <form className="d-flex gap-2 align-items-center flex-wrap" onSubmit={handleLink}>
                <span>🏥 Link your clinic:</span>
                <input className="form-control form-control-sm" style={{ maxWidth: 180 }} placeholder="Patient code, e.g. PT-1001" value={code} onChange={(e) => setCode(e.target.value)} required />
                <button type="submit" className="btn btn-primary btn-sm rounded-pill">Link</button>
              </form>
            )}
          </div>
        </div>
      )}

      {status && <div className="alert alert-info py-2 small">{status}</div>}
      {error && <div className="alert alert-danger py-2 small">{error}</div>}

      {user && items.length === 0 && !busy && <p className="text-secondary small">No prescriptions yet.</p>}

      <div className="row g-3">
        {items.map((rx) => (
          <div className="col-12 col-lg-6" key={rx.id}>
            <div className="card h-100 shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <div className="fw-bold">{rx.doctor || 'Prescription'}{rx.clinic ? ` · ${rx.clinic}` : ''}</div>
                    <div className="text-secondary small">
                      {rx.date || new Date(rx.uploadedAt).toISOString().slice(0, 10)}
                      {rx.demo && <span className="badge text-bg-light ms-2">demo data</span>}
                      {rx.source === 'clinic' && <span className="badge text-bg-info ms-2">from clinic</span>}
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline-danger btn-sm rounded-pill" onClick={() => handleDelete(rx.id)} aria-label="Delete">✕</button>
                </div>

                {rx.simplified.length > 0 && (
                  <ul className="small mt-3 mb-2 ps-3">
                    {rx.simplified.map((pt, i) => <li key={i}>{pt}</li>)}
                  </ul>
                )}

                {rx.medicines.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-sm small mb-2">
                      <thead><tr><th>Medicine</th><th>Dose</th><th>When</th><th>Days</th></tr></thead>
                      <tbody>
                        {rx.medicines.map((m, i) => (
                          <tr key={i}>
                            <td>{m.name}</td>
                            <td>{m.dose || '-'}</td>
                            <td>{[m.frequency, m.timing].filter(Boolean).join(', ') || '-'}</td>
                            <td>{m.duration || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {rx.followUpText && (
                  <div className="small">
                    <strong>Next visit:</strong> {rx.followUpText}
                    {rx.followUpDate && (
                      <button type="button" className="btn btn-outline-primary btn-sm rounded-pill ms-2" onClick={() => handleRemind(rx)}>
                        ⏰ Remind me
                      </button>
                    )}
                  </div>
                )}

                {rx.imageData && (
                  <button type="button" className="btn btn-link btn-sm p-0 mt-2" onClick={() => setOpenImage(openImage === rx.id ? null : rx.id)}>
                    {openImage === rx.id ? 'Hide original' : 'View original photo'}
                  </button>
                )}
                {openImage === rx.id && <img src={rx.imageData} alt="Original prescription" className="img-fluid rounded border mt-2" />}
              </div>
            </div>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <p className="text-secondary small mt-3 mb-0">Read from the photo only. Check against the original and follow your doctor's instructions.</p>
      )}
    </section>
  )
}
