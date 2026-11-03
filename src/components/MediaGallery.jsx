import { useEffect, useState } from 'react'
import { deleteMedia, ins } from '../lib/api'
import { compressImage, publicUrl, uploadToTrade } from '../lib/media'
import { fmtBytes } from '../lib/util'
import { useAction, useConfirm, useToast } from './ui'

const MAX_FILE = 15 * 1024 * 1024

// Photos + attachments belonging to one job/lesson (itemId) or one task (taskId)
export default function MediaGallery({ tradeId, itemId, taskId, items = [], editing, reload, label = 'Photos & files' }) {
  const [run, busy] = useAction()
  const [prog, setProg] = useState('')
  const [view, setView] = useState(null)       // index in photos
  const confirm = useConfirm()
  const toast = useToast()
  const photos = items.filter((m) => m.kind === 'photo')
  const files = items.filter((m) => m.kind !== 'photo')

  useEffect(() => {
    if (view === null) return
    const k = (e) => {
      if (e.key === 'Escape') setView(null)
      if (e.key === 'ArrowRight') setView((v) => (v + 1) % photos.length)
      if (e.key === 'ArrowLeft') setView((v) => (v - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [view, photos.length])

  async function pick(list) {
    const arr = [...list]
    await run(async () => {
      let n = 0
      for (const f of arr) {
        setProg(`Uploading ${++n} of ${arr.length}…`)
        const isImg = f.type.startsWith('image/')
        if (!isImg && f.size > MAX_FILE) { toast(`${f.name} is larger than 15 MB — skipped`, 'err'); continue }
        const blob = isImg ? await compressImage(f) : f
        const up = await uploadToTrade(tradeId, blob, f.name)
        await ins('media', {
          ...(itemId ? { item_id: itemId } : { task_id: taskId }),
          path: up.path, file_name: f.name, mime_type: up.type, size_bytes: up.size,
          kind: isImg ? 'photo' : 'file', sort_order: items.length + n,
        })
      }
      setProg(''); await reload()
    })
    setProg('')
  }
  async function remove(m) {
    if (!(await confirm({ title: 'Remove this file?', body: m.file_name, danger: true, confirmText: 'Remove' }))) return
    await run(async () => { await deleteMedia(m.id); await reload() })
  }

  if (!editing && !items.length) return null
  return (
    <div className="mt">
      <div className="row gap-s wrap">
        <b className="small muted">{label}</b>
        {editing && (
          <label className="btn sm" style={{ cursor: 'pointer' }}>
            {busy ? prog || 'Working…' : '＋ Add'}
            <input type="file" multiple hidden disabled={busy} onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
          </label>
        )}
      </div>
      <div className="gallery">
        {photos.map((m, i) => (
          <div className="thumb" key={m.id} onClick={() => setView(i)} title={m.file_name}>
            <img src={publicUrl(m.path)} alt={m.file_name} loading="lazy" />
            {editing && <button className="x" aria-label="Remove" onClick={(e) => { e.stopPropagation(); remove(m) }}>✕</button>}
          </div>
        ))}
        {files.map((m) => (
          <span className="filechip" key={m.id}>
            📎 <a href={publicUrl(m.path)} target="_blank" rel="noopener noreferrer" download={m.file_name} className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.file_name}</a>
            <small className="muted">{fmtBytes(m.size_bytes)}</small>
            {editing && <button className="icon-btn" aria-label="Remove" onClick={() => remove(m)}>✕</button>}
          </span>
        ))}
      </div>
      {view !== null && photos[view] && (
        <div className="lightbox" onClick={() => setView(null)}>
          <img src={publicUrl(photos[view].path)} alt={photos[view].file_name} />
          {photos.length > 1 && <div className="row gap" style={{ position: 'fixed', bottom: 16, left: 0, right: 0, justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn" onClick={() => setView((view - 1 + photos.length) % photos.length)}>◀</button>
            <span style={{ color: '#fff' }}>{view + 1} / {photos.length}</span>
            <button className="btn" onClick={() => setView((view + 1) % photos.length)}>▶</button>
          </div>}
        </div>
      )}
    </div>
  )
}
