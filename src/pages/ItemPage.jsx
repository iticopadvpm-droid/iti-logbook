import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { del, ins, upd } from '../lib/api'
import { useData } from '../lib/data'
import { clean, isEmptyHtml } from '../lib/sanitize'
import { externalizeImages } from '../lib/media'
import { Empty, Field, Modal, useAction, useConfirm, useToast } from '../components/ui'
import MediaGallery from '../components/MediaGallery'
import HistoryModal from '../components/HistoryModal'
import RichEditor from '../components/RichEditor'

function ItemForm({ item, onClose }) {
  const d = useData()
  const [f, setF] = useState({ number: item.number, title: item.title, hours: item.hours ?? '' })
  const [run, busy] = useAction()
  return (
    <Modal title="Edit details" onClose={onClose} small>
      <form onSubmit={(e) => { e.preventDefault(); run(async () => {
        await upd('splitup_items', item.id, { number: f.number.trim(), title: f.title.trim(), hours: f.hours === '' ? null : Number(f.hours) })
        await d.reload(); onClose()
      }, 'Saved') }}>
        <Field label="Number"><input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} required /></Field>
        <Field label="Name"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
        <Field label="Hours"><input type="number" min="0" step="0.5" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
        <div className="row end gap"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  )
}

const TASK_FIELDS = [['aim', 'Aim'], ['procedure', 'Procedure'], ['result', 'Result'], ['conclusion', 'Conclusion']]

function TaskForm({ item, task, count, onClose }) {
  const d = useData()
  const [f, setF] = useState({ number: task?.number ?? `${item.number}.${count + 1}`, name: task?.name ?? '', aim: task?.aim ?? '', procedure: task?.procedure ?? '', result: task?.result ?? '', conclusion: task?.conclusion ?? '' })
  const [hist, setHist] = useState(false)
  const [run, busy] = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title={task ? `Edit task ${task.number}` : 'Add task'} onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); run(async () => {
        const row = { ...f, number: f.number.trim(), name: f.name.trim() }
        if (!row.number || !row.name) throw new Error('Number and name are required.')
        if (task) await upd('tasks', task.id, row); else await ins('tasks', { ...row, item_id: item.id, sort_order: count + 1 })
        await d.reload(); onClose()
      }, 'Task saved') }}>
        <div className="form-grid" style={{ gridTemplateColumns: '120px 1fr' }}>
          <Field label="Task no."><input value={f.number} onChange={set('number')} required /></Field>
          <Field label="Task name"><input autoFocus value={f.name} onChange={set('name')} required /></Field>
        </div>
        {TASK_FIELDS.map(([k, label]) => <Field key={k} label={label}><textarea rows={k === 'procedure' ? 7 : 3} value={f[k]} onChange={set(k)} /></Field>)}
        <div className="row between gap">
          <span>{task && <button type="button" className="btn sm" onClick={() => setHist(true)}>🕘 Earlier versions</button>}</span>
          <span className="row gap"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save task</button></span>
        </div>
      </form>
      {hist && <HistoryModal rowId={task.id} fields={TASK_FIELDS.map(([id, label]) => ({ id, label }))} onClose={() => setHist(false)}
        onRestore={(field, value) => setF((x) => ({ ...x, [field]: value || '' }))} />}
    </Modal>
  )
}

function TaskCard({ task, item }) {
  const d = useData()
  const confirm = useConfirm()
  const [run] = useAction()
  const [edit, setEdit] = useState(false)
  const media = d.mediaByTask[task.id] || []
  return (
    <div className="task">
      <div className="task-h">
        <span className="num">{task.number}</span><b className="grow">{task.name}</b>
        {d.editing && <span className="no-print">
          <button className="icon-btn" aria-label="Edit task" onClick={() => setEdit(true)}>✎</button>
          <button className="icon-btn" aria-label="Delete task" onClick={async () => {
            if (await confirm({ title: `Delete task ${task.number}?`, body: task.name, danger: true, confirmText: 'Delete' })) run(async () => { await del('tasks', task.id); await d.reload() }, 'Deleted')
          }}>🗑</button>
        </span>}
      </div>
      <div className="task-b">
        {TASK_FIELDS.map(([k, label]) => task[k] ? <div className="tf" key={k}><div className="lbl">{label}</div><div className="val">{task[k]}</div></div> : null)}
        {!TASK_FIELDS.some(([k]) => task[k]) && <span className="muted small">Nothing written yet.</span>}
        <MediaGallery tradeId={d.tradeId} taskId={task.id} items={media} editing={d.editing} reload={d.reload} label="Task photos" />
      </div>
      {edit && <TaskForm item={item} task={task} count={d.tasksByItem[item.id].length} onClose={() => setEdit(false)} />}
    </div>
  )
}

function Theory({ item }) {
  const d = useData()
  const toast = useToast()
  const [html, setHtml] = useState(item.content || '')
  const [saved, setSaved] = useState(item.content || '')
  const [run, busy] = useAction()
  const [hist, setHist] = useState(false)
  const dirty = html !== saved
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty

  useEffect(() => { setHtml(item.content || ''); setSaved(item.content || '') }, [item.id])  // eslint-disable-line
  useEffect(() => {
    const h = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [])

  const save = () => run(async () => {
    const out = await externalizeImages(html, d.tradeId)
    await upd('splitup_items', item.id, { content: out })
    setHtml(out); setSaved(out); await d.reload()
  }, 'Notes saved')

  if (!d.editing) {
    return isEmptyHtml(item.content)
      ? <Empty>No notes written for this lesson yet.</Empty>
      : <div className="card"><div className="prose" dangerouslySetInnerHTML={{ __html: clean(item.content) }} /></div>
  }
  return (
    <>
      <RichEditor value={html} onChange={setHtml} tradeId={d.tradeId} />
      <div className="row between gap mt no-print" style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0' }}>
        <span className="small" style={{ color: dirty ? 'var(--accent)' : 'var(--muted)' }}>{dirty ? '● Unsaved changes' : '✓ Saved'}</span>
        <span className="row gap">
          <button className="btn" onClick={() => setHist(true)}>🕘 Earlier versions</button>
          <button className="btn" disabled={!dirty} onClick={() => { setHtml(saved) }}>Discard changes</button>
          <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save notes'}</button>
        </span>
      </div>
      {hist && <HistoryModal rowId={item.id} fields={[{ id: 'content', label: 'Notes' }]} onClose={() => setHist(false)} onRestore={(f, v) => { setHtml(v || ''); toast('Restored — press Save notes to keep it') }} />}
    </>
  )
}

export default function ItemPage() {
  const { itemId } = useParams()
  const d = useData()
  const [edit, setEdit] = useState(false)
  const [taskForm, setTaskForm] = useState(false)
  const item = d.itemById[itemId]
  if (!item) return <Navigate to={`${d.base}/`} replace />
  const lo = d.loById[item.lo_id]
  const isP = item.kind === 'practical'
  const siblings = (d.itemsByLo[lo.id] || []).filter((i) => i.kind === item.kind)
  const at = siblings.findIndex((i) => i.id === item.id)
  const prev = siblings[at - 1], next = siblings[at + 1]
  const tasks = d.tasksByItem[item.id] || []

  return (
    <>
      <div className="crumbs"><Link to={`${d.base}/`}>Home</Link> › <Link to={`${d.base}/lo/${lo.id}`}>LO {lo.number}</Link> › {isP ? 'Job' : 'Lesson'} {item.number}</div>
      <div className="row between wrap gap">
        <div>
          <h1><span className="num">{item.number}</span> {item.title}</h1>
          <p className="muted">{isP ? 'Practical job' : 'Theory lesson'}{item.hours ? ` · ${item.hours} hours` : ''} · LO {lo.number} {lo.title}</p>
        </div>
        <div className="row gap-s wrap no-print">
          {d.editing && <button className="btn" onClick={() => setEdit(true)}>✎ Edit details</button>}
          <Link className="btn" to={`${d.base}/sheet/item/${item.id}`}>🖨️ {isP ? 'Job sheet' : 'Information sheet'}</Link>
        </div>
      </div>

      <div className="mt">
        {isP && !isEmptyHtml(item.content) && <div className="card mb"><b className="small muted">Job notes</b><div className="prose" dangerouslySetInnerHTML={{ __html: clean(item.content) }} /></div>}
        {isP ? (
          <>
            <div className="row between gap mb">
              <h2>Logbook tasks <span className="muted small" style={{ fontWeight: 400 }}>({tasks.length})</span></h2>
              {d.editing && <button className="btn primary no-print" onClick={() => setTaskForm(true)}>＋ Add task</button>}
            </div>
            {tasks.length ? tasks.map((t) => <TaskCard key={t.id} task={t} item={item} />) : <Empty>No tasks recorded for this job yet.</Empty>}
          </>
        ) : <Theory item={item} key={item.id} />}
        <MediaGallery tradeId={d.tradeId} itemId={item.id} items={d.mediaByItem[item.id] || []} editing={d.editing} reload={d.reload} label={isP ? 'Job photos & files' : 'Lesson files & downloads'} />
      </div>

      <div className="row between mt no-print" style={{ marginTop: 28 }}>
        {prev ? <Link className="btn" to={`${d.base}/item/${prev.id}`}>← {prev.number} {prev.title.slice(0, 28)}</Link> : <span />}
        {next ? <Link className="btn" to={`${d.base}/item/${next.id}`}>{next.number} {next.title.slice(0, 28)} →</Link> : <span />}
      </div>
      {edit && <ItemForm item={item} onClose={() => setEdit(false)} />}
      {taskForm && <TaskForm item={item} count={tasks.length} onClose={() => setTaskForm(false)} />}
    </>
  )
}
