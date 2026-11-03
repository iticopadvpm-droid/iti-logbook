import { useState } from 'react'
import { ins, upd } from '../lib/api'
import { useData } from '../lib/data'
import { Field, Modal, useAction } from './ui'

// Add or edit a learning outcome
export default function LoForm({ lo, onClose, onSaved }) {
  const d = useData()
  const nextNo = String(Math.max(0, ...d.los.map((l) => parseInt(l.number, 10) || 0)) + 1)
  const [f, setF] = useState({ number: lo?.number ?? nextNo, title: lo?.title ?? '', description: lo?.description ?? '' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = (e) => {
    e.preventDefault()
    run(async () => {
      const row = { number: f.number.trim(), title: f.title.trim(), description: f.description.trim() }
      if (!row.number || !row.title) throw new Error('Number and title are required.')
      const r = lo ? await upd('learning_outcomes', lo.id, row)
        : await ins('learning_outcomes', { ...row, trade_id: d.tradeId, sort_order: d.los.length + 1 })
      await d.reload(); onSaved?.(r); onClose()
    }, lo ? 'Saved' : 'Learning outcome added')
  }
  return (
    <Modal title={lo ? `Edit learning outcome ${lo.number}` : 'Add learning outcome'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid" style={{ gridTemplateColumns: '110px 1fr' }}>
          <Field label="Number"><input autoFocus={!lo} value={f.number} onChange={set('number')} required /></Field>
          <Field label="Title"><input autoFocus={!!lo} value={f.title} onChange={set('title')} placeholder="e.g. Computer fundamentals" required /></Field>
        </div>
        <Field label="Description (optional)"><textarea rows={3} value={f.description} onChange={set('description')} /></Field>
        <div className="row end gap"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  )
}
