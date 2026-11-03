import { useEffect, useState } from 'react'
import { rpc } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { supabase } from '../lib/supabase'
import { Field, Modal, useAction } from './ui'

// Share learning outcomes (with their split-up, tasks and notes) to the repository
export default function PublishModal({ onClose, preselect = [], onDone }) {
  const d = useData()
  const a = useAuth()
  const [sel, setSel] = useState(new Set(preselect.length ? preselect : d.los.map((l) => l.id)))
  const [title, setTitle] = useState(`${d.trade?.name || 'Trade'} — ${d.iti?.short_name || d.iti?.name || ''}`.replace(/ — $/, ''))
  const [desc, setDesc] = useState('')
  const [vis, setVis] = useState('all')
  const [lineage, setLineage] = useState('')
  const [mine, setMine] = useState([])
  const [run, busy] = useAction()

  useEffect(() => {
    supabase.from('repo_packages').select('lineage_id,version,title,published_by,source_iti_id').order('version', { ascending: false })
      .then(({ data }) => {
        const seen = new Map()
        ;(data || []).filter((p) => p.published_by === a.session.user.id || a.adminItiIds.includes(p.source_iti_id))
          .forEach((p) => { if (!seen.has(p.lineage_id)) seen.set(p.lineage_id, p) })
        setMine([...seen.values()])
      })
  }, [a.session.user.id, a.adminItiIds])

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const count = (loId) => (d.itemsByLo[loId] || []).length

  return (
    <Modal title="Share to repository" onClose={onClose} wide>
      <p className="muted small">Publishing makes a <b>snapshot</b> that other instructors can copy and edit as their own. Your own data is never changed by their copies.</p>
      <div className="field"><span>Learning outcomes to share</span>
        <div className="card" style={{ maxHeight: 230, overflow: 'auto', padding: 8 }}>
          <label className="row gap-s" style={{ padding: '4px 6px' }}>
            <input type="checkbox" checked={sel.size === d.los.length} onChange={(e) => setSel(new Set(e.target.checked ? d.los.map((l) => l.id) : []))} /> <b>Select all</b>
          </label>
          {d.los.map((l) => (
            <label key={l.id} className="row gap-s" style={{ padding: '4px 6px' }}>
              <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} />
              <span className="num">{l.number}</span><span className="grow">{l.title}</span><span className="muted small">{count(l.id)} items</span>
            </label>
          ))}
        </div>
      </div>
      <div className="form-grid">
        <Field label="Package title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Who can see it">
          <select value={vis} onChange={(e) => setVis(e.target.value)}>
            <option value="all">Everyone who uses this system</option>
            <option value="iti">Only people of my ITI</option>
          </select>
        </Field>
      </div>
      <Field label="Description (what is inside, which semester/batch…)"><textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      {mine.length > 0 && (
        <Field label="Publish as" hint="A new version keeps the older versions; people who copied an older one will see that an update exists.">
          <select value={lineage} onChange={(e) => { setLineage(e.target.value); const p = mine.find((x) => x.lineage_id === e.target.value); if (p) setTitle(p.title) }}>
            <option value="">A new package</option>
            {mine.map((p) => <option key={p.lineage_id} value={p.lineage_id}>New version of “{p.title}” (now v{p.version})</option>)}
          </select>
        </Field>
      )}
      <div className="row end gap">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !sel.size || !title.trim()} onClick={() => run(async () => {
          await rpc('publish_package', { p_trade: d.tradeId, p_lo_ids: [...sel], p_title: title, p_description: desc, p_visibility: vis, p_lineage: lineage || null })
          onDone?.(); onClose()
        }, 'Published to the repository')}>{busy ? 'Publishing…' : `Publish ${sel.size} learning outcome${sel.size === 1 ? '' : 's'}`}</button>
      </div>
    </Modal>
  )
}
