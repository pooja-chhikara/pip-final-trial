import { api } from './api.js'

// Shrinks a photo to a small JPEG data URL (~100-250 KB) before upload.
export function imageFileToDataUrl(file, maxSide = 1400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the image.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not a valid image.'))
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export const listRecords = (user) => api(user, '/api/records')
export const saveRecord = (user, rec) => api(user, '/api/records', { method: 'POST', body: JSON.stringify(rec) })
export const deleteRecord = (user, id) => api(user, `/api/records/${id}`, { method: 'DELETE' })
export const explainRecordApi = (user, id) => api(user, `/api/records/${id}/explain`, { method: 'POST' })

export const listPrescriptions = (user) => api(user, '/api/prescriptions')
export const uploadPrescription = (user, title, imageData) =>
  api(user, '/api/prescriptions', { method: 'POST', body: JSON.stringify({ title, imageData }) })
export const deletePrescription = (user, id) => api(user, `/api/prescriptions/${id}`, { method: 'DELETE' })
