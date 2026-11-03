import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { del } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { supabase } from '../lib/supabase'
import { isEmptyHtml } from '../lib/sanitize'
import { Badge, Empty, useAction, useConfirm } from '../components/ui'
import LoForm from '../components/LoForm'
import PublishModal from '../components/PublishModal'

export default function Home() {
  const d = useData()
  const a = useAuth()
  const confirm = useConfirm()
  const [run] = useAction()
  const [form, setForm] = useState(null)       // null | {} | lo
  const [pub, setPub] = useState(false)
  const [updates, setUpdates] = useState([])

  const stats = useMemo(() => {
    const done = (it) => (it.kind === 'practical' ? (d.tasksByItem[it.id] || []).length > 0 : !isEmptyHtml(it.content))
    const per = d.los.map((l) => {
      const its = d.itemsByLo[l.id] || []
      const p = its.filter((i) => i.kind === 'practical'), t = its.filter((i) => i.kind === 'theory')
      const dn = its.filter(done).length
      return { lo: l, p: p.length, t: t.length, done: dn, total: its.length, pct: its.length ? Math.round((100 * dn) / its.length) : 0 }
    })
    const filledWeeks = new Set(d.entries.filter((e) => e.practical_no || e.theory_no || e.practical_title || e.theory_title).map((e) => e.diary_id + e.week_start)).size
    return { per, practical: d.practical.length, theory: d.theory.length, tasks: d.tasks.length, weeks: filledWeeks,
      hours: d.items.reduce((s, i) => s + (Number(i.hours) || 0), 0) }
  }, [d])

  // newer versions of packages this trade was copied from
  useEffect(() => {
    if (d.readOnly || !d.los.length) return
    const lineages = [...new Set(d.los.map((l) => l.source_lineage_id).filter(Boolean))]
    if (!lineages.length) return
    supabase.from('repo_packages').select('lineage_id,version,title').in('lineage_id', lineages).eq('status', 'published')
      .then(({ data }) => {
        const latest = {}
        ;(data || []).forEach((p) => { if (!latest[p.lineage_id] || p.version > latest[p.lineage_id].version) latest[p.lineage_id] = p })
        const have = {}
        d.los.forEach((l) => { if (l.source_lineage_id) have[l.source_lineage_id] = Math.min(have[l.source_lineage_id] ?? 1e9, l.source_version || 0) })
        setUpdates(Object.entries(latest).filter(([k, p]) => p.version > have[k]).map(([k, p]) => ({ ...p, have: have[k] })))
      })
  }, [d.los, d.readOnly])

  if (!d.trade) {
    return (
      <Empty>
        <h2>No trade to show yet</h2>
        <p>{a?.isAdmin ? 'Create your first trade to begin.' : 'An administrator needs to add a trade for you.'}</p>
        {a?.isAdmin && <Link className="btn primary" to="/settings/trades">Add a trade</Link>}
        <p className="small" style={{ marginTop: 10 }}>You can also browse the <Link to="/repo">shared repository</Link>.</p>
      </Empty>
    )
  }

  const b = d.base
  async function remove(lo) {
    const n = (d.itemsByLo[lo.id] || []).length
    if (!(await confirm({ title: `Delete LO ${lo.number}?`, body: `This also deletes its ${n} split-up item(s), their tasks, notes and photo links. This cannot be undone.`, danger: true, confirmText: 'Delete', typeToConfirm: lo.number }))) return
    run(async () => { await del('learning_outcomes', lo.id); await d.reload() }, 'Deleted')
  }

  return (
    <>
      <div className="row between wrap gap">
        <div>
          <h1>{d.trade.name}</h1>
          <p className="muted">{d.iti?.name}{d.trade.code ? ` · ${d.trade.code}` : ''}{d.trade.duration_months ? ` · ${d.trade.duration_months} months` : ''}</p>
        </div>
        {d.editing && (
          <div className="row gap wrap no-print">
            <button className="btn primary" onClick={() => setForm({})}>＋ Add learning outcome</button>
            <button className="btn" onClick={() => setPub(true)} disabled={!d.los.length}>🗂️ Share to repository</button>
          </div>
        )}
      </div>

      {updates.map((u) => (
        <div className="notice warn" key={u.lineage_id}>
          🔔 A newer version (v{u.version}) of <b>{u.title}</b> is in the repository — you copied v{u.have}. <Link to="/repo">Open repository</Link>
        </div>
      ))}

      <div className="stats">
        <div className="stat"><b>{d.los.length}</b><span>Learning outcomes</span></div>
        <div className="stat"><b>{stats.practical}</b><span>Practical jobs</span></div>
        <div className="stat"><b>{stats.theory}</b><span>Theory lessons</span></div>
        <div className="stat"><b>{stats.tasks}</b><span>Logbook tasks</span></div>
        <div className="stat"><b>{stats.hours || '–'}</b><span>Hours planned</span></div>
        <div className="stat"><b>{stats.weeks}</b><span>Diary weeks filled</span></div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Learning outcomes</h2><span className="muted small">Bar = jobs with tasks + lessons with notes</span></div>
        {!d.los.length ? (
          <Empty>
            No learning outcomes yet.
            {d.editing ? <div style={{ marginTop: 10 }}><button className="btn primary" onClick={() => setForm({})}>Add the first one</button> or copy a ready-made syllabus from the <Link to="/repo">repository</Link>.</div>
              : d.canEdit ? <div className="small" style={{ marginTop: 6 }}>Switch on <b>Edit mode</b> (top right) to add some, or copy a ready-made syllabus from the <Link to="/repo">repository</Link>.</div> : null}
          </Empty>
        ) : stats.per.map(({ lo, p, t, pct, done, total }) => (
          <div className="lo-row" key={lo.id}>
            <span className="num" style={{ fontSize: '1.15rem' }}>{lo.number}</span>
            <div>
              <Link to={`${b}/lo/${lo.id}`}><b>{lo.title}</b></Link>
              <div className="small muted">{p} practical · {t} theory {lo.source_package_id && <Badge tone="blue">copied v{lo.source_version}</Badge>}</div>
            </div>
            <div className="bar-wrap row gap-s">
              <div className="bar grow" title={`${done} of ${total} filled`}><i style={{ width: pct + '%' }} /></div>
              <span className="small muted" style={{ width: 34, textAlign: 'right' }}>{pct}%</span>
              {d.editing && <span className="row no-print">
                <button className="icon-btn" aria-label="Edit" onClick={() => setForm(lo)}>✎</button>
                <button className="icon-btn" aria-label="Delete" onClick={() => remove(lo)}>🗑</button>
              </span>}
            </div>
          </div>
        ))}
      </div>

      {form && <LoForm lo={form.id ? form : null} onClose={() => setForm(null)} />}
      {pub && <PublishModal onClose={() => setPub(false)} />}
    </>
  )
}
