import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { del, ins, insMany, upd } from '../lib/api'
import { useData } from '../lib/data'
import { isEmptyHtml } from '../lib/sanitize'
import { parseBulkLines } from '../lib/util'
import { Badge, Empty, Field, Modal, useAction, useConfirm } from '../components/ui'
import LoForm from '../components/LoForm'
import PublishModal from '../components/PublishModal'

const nextNumber = (lo, items) => {
  const used = items.map((i) => i.number.split('.')).filter((p) => p[0] === lo.number && p.length === 2).map((p) => parseInt(p[1], 10) || 0)
  return `${lo.number}.${Math.max(0, ...used) + 1}`
}

function ItemForm({ lo, kind, item, items, onClose }) {
  const d = useData()
  const [f, setF] = useState({ number: item?.number ?? nextNumber(lo, items), title: item?.title ?? '', hours: item?.hours ?? '' })
  const [run, busy] = useAction()
  const save = (e) => {
    e.preventDefault()
    run(async () => {
      const row = { number: f.number.trim(), title: f.title.trim(), hours: f.hours === '' ? null : Number(f.hours) }
      if (!row.number || !row.title) throw new Error('Number and title are required.')
      if (item) await upd('splitup_items', item.id, row)
      else await ins('splitup_items', { ...row, lo_id: lo.id, kind, sort_order: items.length + 1 })
      await d.reload(); onClose()
    }, item ? 'Saved' : 'Added')
  }
  const word = kind === 'practical' ? 'job' : 'lesson'
  return (
    <Modal title={`${item ? 'Edit' : 'Add'} ${word}`} onClose={onClose} small>
      <form onSubmit={save}>
        <Field label="Number" hint="Text, so 1.10 stays different from 1.1."><input autoFocus value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} required /></Field>
        <Field label={kind === 'practical' ? 'Job name' : 'Lesson name'}><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
        <Field label="Hours (optional)"><input type="number" min="0" step="0.5" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
        <div className="row end gap"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  )
}

function BulkForm({ lo, kind, items, onClose }) {
  const d = useData()
  const [text, setText] = useState('')
  const [run, busy] = useAction()
  const parsed = parseBulkLines(text)
  const have = new Set(items.map((i) => i.number))
  const fresh = parsed.filter((p) => !have.has(p.number))
  return (
    <Modal title={`Add many ${kind === 'practical' ? 'jobs' : 'lessons'} at once`} onClose={onClose} wide>
      <p className="muted small">One per line: number, name, and optionally hours after a <code>|</code>. Example: <code>{lo.number}.1 Safety rules | 4</code>. Paste straight from a Word/Excel list.</p>
      <textarea rows={10} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={`${lo.number}.1 First item | 4\n${lo.number}.2 Second item | 6`} className="mono" />
      <p className="small" style={{ margin: '8px 0' }}>
        <b>{fresh.length}</b> will be added{parsed.length - fresh.length > 0 && <> · <span className="muted">{parsed.length - fresh.length} skipped (number already exists)</span></>}
        {text.trim() && parsed.length === 0 && <span style={{ color: 'var(--danger)' }}> · No line starts with a number</span>}
      </p>
      <div className="row end gap">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !fresh.length} onClick={() => run(async () => {
          await insMany('splitup_items', fresh.map((p, i) => ({ lo_id: lo.id, kind, number: p.number, title: p.title, hours: p.hours, sort_order: items.length + i + 1 })))
          await d.reload(); onClose()
        }, `${fresh.length} added`)}>Add {fresh.length}</button>
      </div>
    </Modal>
  )
}

function SplitTable({ lo, kind }) {
  const d = useData()
  const confirm = useConfirm()
  const [run] = useAction()
  const [form, setForm] = useState(null)
  const [bulk, setBulk] = useState(false)
  const items = (d.itemsByLo[lo.id] || []).filter((i) => i.kind === kind)
  const isP = kind === 'practical'
  const hours = items.reduce((s, i) => s + (Number(i.hours) || 0), 0)
  const status = (i) => isP
    ? ((d.tasksByItem[i.id] || []).length ? <Badge tone="ok">{d.tasksByItem[i.id].length} task{d.tasksByItem[i.id].length > 1 ? 's' : ''}</Badge> : <Badge>no tasks</Badge>)
    : (isEmptyHtml(i.content) ? <Badge>no notes</Badge> : <Badge tone="ok">notes</Badge>)

  async function remove(i) {
    const extra = isP ? ` and its ${(d.tasksByItem[i.id] || []).length} task(s)` : ' and its notes'
    if (!(await confirm({ title: `Delete ${i.number}?`, body: `“${i.title}”${extra} will be deleted for good.`, danger: true, confirmText: 'Delete' }))) return
    run(async () => { await del('splitup_items', i.id); await d.reload() }, 'Deleted')
  }

  return (
    <div className="card" data-kind={kind}>
      <div className="card-head">
        <h2>{isP ? '🛠️ Practical split-up' : '📖 Theory split-up'} <span className="muted small" style={{ fontWeight: 400 }}>· {items.length} {isP ? 'jobs' : 'lessons'}{hours ? ` · ${hours} h` : ''}</span></h2>
        <div className="row gap-s wrap no-print">
          {items.length > 0 && <Link className="btn sm" to={`${d.base}/sheet/lo/${lo.id}/${kind}`}>🖨️ {isP ? 'Job sheets' : 'Info sheets'}</Link>}
          {d.editing && <>
            <button className="btn sm" onClick={() => setBulk(true)}>Paste list</button>
            <button className="btn sm primary" onClick={() => setForm({})}>＋ Add {isP ? 'job' : 'lesson'}</button>
          </>}
        </div>
      </div>
      {!items.length ? <Empty>No {isP ? 'jobs' : 'lessons'} yet{d.editing ? '' : '.'}{d.editing && <> — use <b>＋ Add</b> or <b>Paste list</b>.</>}</Empty> : (
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th style={{ width: 70 }}>No.</th><th>{isP ? 'Job' : 'Lesson'}</th><th style={{ width: 70 }}>Hours</th><th style={{ width: 110 }}>Status</th>{d.editing && <th style={{ width: 90 }} className="no-print" />}</tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="num">{i.number}</td>
                  <td><Link to={`${d.base}/item/${i.id}`}>{i.title}</Link></td>
                  <td className="muted">{i.hours ?? ''}</td>
                  <td>{status(i)}</td>
                  {d.editing && <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" aria-label="Edit" onClick={() => setForm(i)}>✎</button>
                    <button className="icon-btn" aria-label="Delete" onClick={() => remove(i)}>🗑</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <ItemForm lo={lo} kind={kind} item={form.id ? form : null} items={items} onClose={() => setForm(null)} />}
      {bulk && <BulkForm lo={lo} kind={kind} items={items} onClose={() => setBulk(false)} />}
    </div>
  )
}

export default function LoPage() {
  const { loId } = useParams()
  const d = useData()
  const nav = useNavigate()
  const confirm = useConfirm()
  const [run] = useAction()
  const [edit, setEdit] = useState(false)
  const [pub, setPub] = useState(false)
  const lo = d.loById[loId]
  if (!lo) return <Navigate to={`${d.base}/`} replace />

  return (
    <>
      <div className="crumbs"><Link to={`${d.base}/`}>Home</Link> › LO {lo.number}</div>
      <div className="row between wrap gap">
        <div>
          <h1><span className="num">{lo.number}</span> {lo.title}</h1>
          {lo.description && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{lo.description}</p>}
          {lo.source_package_id && <Badge tone="blue">Copied from the repository (v{lo.source_version}) — your own editable version</Badge>}
        </div>
        {d.editing && (
          <div className="row gap-s wrap no-print">
            <button className="btn" onClick={() => setEdit(true)}>✎ Edit</button>
            <button className="btn" onClick={() => setPub(true)}>🗂️ Share this LO</button>
            <button className="btn" onClick={async () => {
              if (!(await confirm({ title: `Delete LO ${lo.number}?`, body: 'Its split-up, tasks and notes are deleted too.', danger: true, confirmText: 'Delete', typeToConfirm: lo.number }))) return
              run(async () => { await del('learning_outcomes', lo.id); await d.reload(); nav('/') }, 'Deleted')
            }}>🗑 Delete</button>
          </div>
        )}
      </div>
      <div className="mt"><SplitTable lo={lo} kind="practical" /></div>
      <SplitTable lo={lo} kind="theory" />
      {edit && <LoForm lo={lo} onClose={() => setEdit(false)} />}
      {pub && <PublishModal preselect={[lo.id]} onClose={() => setPub(false)} />}
    </>
  )
}
