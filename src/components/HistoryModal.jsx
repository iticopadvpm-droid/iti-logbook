import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Modal, Spinner } from './ui'

const plain = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

// Earlier versions of a long text field (the last 20 are kept automatically)
export default function HistoryModal({ rowId, fields, onRestore, onClose }) {
  const [field, setField] = useState(fields[0].id)
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null)
  useEffect(() => {
    setRows(null)
    supabase.from('content_history').select('*').eq('row_id', rowId).eq('field', field).order('changed_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [rowId, field])
  return (
    <Modal title="Earlier versions" onClose={onClose} wide>
      {fields.length > 1 && (
        <select value={field} onChange={(e) => setField(e.target.value)} style={{ width: 'auto', marginBottom: 12 }}>
          {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      )}
      {!rows ? <Spinner /> : !rows.length ? <p className="muted">Nothing has been overwritten yet.</p> : (
        <div className="col gap-s">
          {rows.map((r) => (
            <div key={r.id} className="card" style={{ padding: '10px 14px' }}>
              <div className="row between gap">
                <b className="small">{new Date(r.changed_at).toLocaleString()}</b>
                <span className="row gap-s">
                  <button className="btn sm" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'View'}</button>
                  <button className="btn sm primary" onClick={() => { onRestore(field, r.old_value); onClose() }}>Restore</button>
                </span>
              </div>
              {open === r.id
                ? <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 8, maxHeight: 260, overflow: 'auto' }}>{plain(r.old_value)}</div>
                : <div className="small muted" style={{ marginTop: 4 }}>{plain(r.old_value).slice(0, 160) || '(empty)'}</div>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
