import { Link, Navigate, useParams } from 'react-router-dom'
import { useData } from '../lib/data'
import { clean, isEmptyHtml } from '../lib/sanitize'
import { publicUrl } from '../lib/media'

function Header({ d, title }) {
  const iti = d.iti || {}
  return (
    <div className="sheet-hdr">
      <h2>{iti.print_title || iti.name}</h2>
      <p>{[iti.print_subtitle, d.trade?.name && `Trade: ${d.trade.name}`].filter(Boolean).join('  |  ')}</p>
      <p style={{ marginTop: 6, fontWeight: 700, color: '#000' }}>{title}</p>
    </div>
  )
}
const Sign = () => <div className="sheet-sign"><div>Instructor remarks</div><div>Marks awarded</div><div>Instructor signature &amp; date</div></div>

function Field({ label, value }) {
  return <div className="tf"><div className="lbl">{label}</div><div className={`val ${value ? '' : 'blank'}`}>{value || 'Not filled yet.'}</div></div>
}
function Photos({ items }) {
  const ph = (items || []).filter((m) => m.kind === 'photo')
  if (!ph.length) return null
  return <div className="gallery">{ph.map((m) => <img key={m.id} src={publicUrl(m.path)} alt="" style={{ maxWidth: 230, maxHeight: 170, borderRadius: 4, border: '1px solid #bbb' }} />)}</div>
}

export function JobSheet({ item }) {
  const d = useData()
  const lo = d.loById[item.lo_id]
  const tasks = d.tasksByItem[item.id] || []
  return (
    <div className="sheet">
      <Header d={d} title="JOB SHEET" />
      <div className="sheet-meta">
        <div style={{ gridColumn: '1/-1' }}><b>Learning outcome</b><span>LO {lo.number} — {lo.title}</span></div>
        <div><b>Job no.</b><span>{item.number}</span></div><div><b>Job name</b><span>{item.title}</span></div>
        <div><b>No. of tasks</b><span>{tasks.length}</span></div><div><b>Time allotted</b><span>{item.hours ? `${item.hours} hours` : '_______________'}</span></div>
        <div><b>Date</b><span>_______________</span></div>
      </div>
      <Photos items={d.mediaByItem[item.id]} />
      {!tasks.length && <p className="muted center small">No tasks recorded for this job yet.</p>}
      {tasks.map((t) => (
        <div className="task" key={t.id}>
          <div className="task-h"><span className="num" style={{ color: '#000' }}>Task {t.number}</span><b>{t.name}</b></div>
          <div className="task-b">
            <Field label="Aim" value={t.aim} /><Field label="Procedure" value={t.procedure} /><Field label="Result" value={t.result} /><Field label="Conclusion" value={t.conclusion} />
            <Photos items={d.mediaByTask[t.id]} />
          </div>
        </div>
      ))}
      <Sign />
    </div>
  )
}

export function InfoSheet({ item }) {
  const d = useData()
  const lo = d.loById[item.lo_id]
  return (
    <div className="sheet">
      <Header d={d} title="INFORMATION SHEET" />
      <div className="sheet-meta">
        <div style={{ gridColumn: '1/-1' }}><b>Learning outcome</b><span>LO {lo.number} — {lo.title}</span></div>
        <div><b>Lesson no.</b><span>{item.number}</span></div><div><b>Lesson name</b><span>{item.title}</span></div>
        <div><b>Date</b><span>_______________</span></div>
      </div>
      <div className="task"><div className="task-h"><b>Notes</b></div>
        <div className="task-b">{isEmptyHtml(item.content) ? <span className="muted">Notes not added yet.</span> : <div className="prose" dangerouslySetInnerHTML={{ __html: clean(item.content) }} />}
          <Photos items={d.mediaByItem[item.id]} />
        </div>
      </div>
      <Sign />
    </div>
  )
}

const Bar = ({ back, count }) => (
  <div className="row gap mb no-print" style={{ maxWidth: 900, margin: '0 auto 14px' }}>
    <Link className="btn" to={back}>← Back</Link>
    <button className="btn primary" onClick={() => window.print()}>🖨️ Print{count > 1 ? ` all (${count})` : ''}</button>
  </div>
)

export function SheetItem() {
  const { itemId } = useParams()
  const d = useData()
  const item = d.itemById[itemId]
  if (!item) return <Navigate to={`${d.base}/`} replace />
  return <><Bar back={`${d.base}/item/${item.id}`} count={1} />{item.kind === 'practical' ? <JobSheet item={item} /> : <InfoSheet item={item} />}</>
}

export function SheetLo() {
  const { loId, kind } = useParams()
  const d = useData()
  const lo = d.loById[loId]
  if (!lo) return <Navigate to={`${d.base}/`} replace />
  const items = (d.itemsByLo[lo.id] || []).filter((i) => i.kind === kind)
  return (
    <>
      <Bar back={`${d.base}/lo/${lo.id}`} count={items.length} />
      {items.map((i) => (kind === 'practical' ? <JobSheet key={i.id} item={i} /> : <InfoSheet key={i.id} item={i} />))}
      {!items.length && <p className="muted center">Nothing to print yet.</p>}
    </>
  )
}
