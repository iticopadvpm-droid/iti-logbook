import { supabase } from './supabase'
import { uid } from './util'

const BUCKET = 'media'
export const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

// Phone photos are 3–8 MB; shrink to ≤1600px JPEG (usually 150–400 KB) before upload.
export async function compressImage(file, maxDim = 1600, quality = 0.82) {
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return file
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const k = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    if (k === 1 && file.size < 400_000 && /jpe?g/i.test(file.type)) return file
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch { return file }
}

const extOf = (name, type) => {
  const m = String(name || '').match(/\.([a-z0-9]{1,6})$/i)
  if (m) return m[1].toLowerCase()
  return (type.split('/')[1] || 'bin').replace('jpeg', 'jpg')
}

export async function uploadToTrade(tradeId, fileOrBlob, fileName = '') {
  const type = fileOrBlob.type || 'application/octet-stream'
  const path = `${tradeId}/${uid()}.${extOf(fileName || fileOrBlob.name, type)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, fileOrBlob, { contentType: type, cacheControl: '31536000' })
  if (error) throw new Error('Upload failed: ' + error.message)
  return { path, type, size: fileOrBlob.size }
}

// Pasted/dropped pictures arrive as base64 inside the HTML. Move them to storage so rows stay small.
export async function externalizeImages(html, tradeId) {
  if (!html || !/src="data:image\//i.test(html)) return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const img of [...doc.querySelectorAll('img[src^="data:image/"]')]) {
    const blob = await (await fetch(img.getAttribute('src'))).blob()
    const small = await compressImage(new File([blob], 'pasted.png', { type: blob.type }))
    const { path } = await uploadToTrade(tradeId, small, 'pasted.jpg')
    img.setAttribute('src', publicUrl(path))
  }
  return doc.body.innerHTML
}

export const removeFromStorage = async (path) => { if (path) await supabase.storage.from(BUCKET).remove([path]) }
