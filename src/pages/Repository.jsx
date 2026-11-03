import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { supabase } from '../lib/supabase'
import { Badge, Empty, Modal, Spinner, Tabs, useAction, useConfirm, useToast } from '../components/ui'
import PublishModal from '../components/PublishModal'

const COLS = 'id,lineage_id,version,title,description,trade_name,source_iti_id,source_iti_name,published_by,publisher_name,visibility,status,lo_count,item_count,created_at'

function Preview({ pkg, onClose, onUse }) {
  const [full, setFull] = useState(null)
  useEffect(() => { supabase.from('repo_packages').select('payload').eq('id', pkg.id).single().then(({ data }) => setFull(data?.payload)) }, [pkg.id])
  return (
    <Modal title={`${pkg.title} · v${pkg.version}`} onClose={onClose} wide>
      <p className="muted small">{pkg.source_iti_name} · {pkg.publisher_name} · {new Date(pkg.created_at).toLocaleDateString()} · trade: {pkg.trade_name}</p>
      {pkg.description && <p style={{ whiteSpace: 'pre-wrap' }}>{pkg.description}</p>}
      {!full ? <Spinner /> : (
        <div className="col gap-s" style={{ maxHeight: '48vh', overflow: 'auto' }}>
          {full.los.map((lo) => {
            const p = lo.items.filter((i) => i.kind === 'practical'), t = lo.items.filter((i) => i.kind === 'theory')
            return (
              <details key={lo.number} className="card" style={{ padding: '8px 12px' }}>
                <summary><span className="num">{lo.number}</span> <b>{lo.title}</b> <span className="muted small">· {p.length} practical · {t.length} theory · {p.reduce((n, i) => n + i.tasks.length, 0)} tasks</span></summary>
                <div className="small" style={{ marginTop: 8 }}>
                  {[...p, ...t].map((i) => <div key={i.kind + i.number}><span className="num">{i.number}</span> {i.title} <Badge>{i.kind}</Badge>{i.kind === 'practical' && i.tasks.length ? <span className="muted"> · {i.tasks.length} tasks</span> : null}{i.kind === 'theory' && i.content ? <span className="muted"> · notes</span> : null}</div>)}
                </div>
              </details>
            )
          })}
        </div>
      )}
      <div className="row end gap mt"><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { onClose(); onUse(pkg) }}>Use a copy…</button></div>
    </Modal>
  )
}

function UseCopy({ pkg, onClose, onUse }) {
  const a = useAuth()
  const dd = useData()
  const nav = useNavigate()
  const editable = a.trades.filter((t) => a.canEditTrade(t))
  const [target, setTarget] = useState(editable[0]?.id || '')
  const [full, setFull] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [conflict, setConflict] = useState('skip')
  const [existing, setExisting] = useState(new Set())
  const [run, busy] = useAction()
  const toast = useToast()

  useEffect(() => {
    supabase.from('repo_packages').select('payload').eq('id', pkg.id).single().then(({ data }) => {
      setFull(data?.payload); setSel(new Set(data?.payload.los.map((l) => l.number) || []))
    })
  }, [pkg.id])
  useEffect(() => {
    if (!target) return
    supabase.from('learning_outcomes').select('number').eq('trade_id', target).then(({ data }) => setExisting(new Set((data || []).map((x) => x.number))))
  }, [target])

  const clashes = full ? full.los.filter((l) => sel.has(l.number) && existing.has(l.number)).length : 0
  return (
    <Modal title={`Use a copy of “${pkg.title}”`} onClose={onClose} wide>
      {!editable.length ? <div className="notice warn">You can’t edit any trade yet. Ask your ITI administrator to add a trade and give you instructor access.</div> : <>
        <p className="muted small">A <b>copy</b> is added to your trade. You can edit it freely — it never changes the shared original or other people’s copies.</p>
        <label className="field"><span>Copy into trade</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {editable.map((t) => <option key={t.id} value={t.id}>{a.itiOf(t.iti_id)?.short_name || a.itiOf(t.iti_id)?.name} — {t.name}</option>)}
          </select>
        </label>
        <div className="field"><span>Learning outcomes to copy</span>
          {!full ? <Spinner /> : (
            <div className="card" style={{ padding: 8, maxHeight: 220, overflow: 'auto' }}>
              <label className="row gap-s" style={{ padding: '3px 6px' }}><input type="checkbox" checked={sel.size === full.los.length} onChange={(e) => setSel(new Set(e.target.checked ? full.los.map((l) => l.number) : []))} /> <b>All</b></label>
              {full.los.map((l) => (
                <label key={l.number} className="row gap-s" style={{ padding: '3px 6px' }}>
                  <input type="checkbox" checked={sel.has(l.number)} onChange={() => setSel((s) => { const n = new Set(s); n.has(l.number) ? n.delete(l.number) : n.add(l.number); return n })} />
                  <span className="num">{l.number}</span><span className="grow">{l.title}</span>
                  {existing.has(l.number) && <Badge tone="warn">already in trade</Badge>}
                </label>
              ))}
            </div>
          )}
        </div>
        {clashes > 0 && (
          <div className="field"><span>{clashes} learning outcome(s) with the same number already exist in that trade</span>
            <label className="row gap-s"><input type="radio" checked={conflict === 'skip'} onChange={() => setConflict('skip')} /> Keep mine, skip those</label>
            <label className="row gap-s"><input type="radio" checked={conflict === 'replace'} onChange={() => setConflict('replace')} /> Replace mine with the shared version <span className="muted small">(my current content of those LOs is lost)</span></label>
          </div>
        )}
        <div className="row end gap">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !target || !sel.size} onClick={() => run(async () => {
            const r = await rpc('import_package', { p_package: pkg.id, p_trade: target, p_lo_numbers: [...sel], p_conflict: conflict })
            if (target === dd.tradeId) await dd.reload()
            toast(`Copied ${r.created.length} learning outcome(s)${r.skipped.length ? `, skipped ${r.skipped.length}` : ''}`)
            onUse(target); onClose(); nav('/')
          })}>{busy ? 'Copying…' : `Copy ${sel.size} LO${sel.size === 1 ? '' : 's'}`}</button>
        </div>
      </>}
    </Modal>
  )
}

const Card = ({ pkg, children, older }) => (
  <div className="card">
    <div className="row between wrap gap">
      <div>
        <h3>{pkg.title} <Badge tone="blue">v{pkg.version}</Badge> {pkg.visibility === 'iti' && <Badge>My ITI only</Badge>} {pkg.status === 'withdrawn' && <Badge tone="red">withdrawn</Badge>}</h3>
        <div className="muted small">{pkg.trade_name} · {pkg.source_iti_name} · by {pkg.publisher_name || 'unknown'} · {new Date(pkg.created_at).toLocaleDateString()}</div>
      </div>
      <div className="row gap-s wrap">{children}</div>
    </div>
    {pkg.description && <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{pkg.description}</p>}
    <div className="small muted" style={{ marginTop: 6 }}>{pkg.lo_count} learning outcome{pkg.lo_count === 1 ? '' : 's'} · {pkg.item_count} jobs &amp; lessons{older ? ` · ${older} older version(s)` : ''}</div>
  </div>
)

export default function Repository({ onUse }) {
  const a = useAuth()
  const d = useData()
  const confirm = useConfirm()
  const [tab, setTab] = useState('browse')
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [trade, setTrade] = useState('')
  const [prev, setPrev] = useState(null)
  const [use, setUse] = useState(null)
  const [pub, setPub] = useState(false)
  const [run] = useAction()

  const load = useCallback(async () => {
    const { data } = await supabase.from('repo_packages').select(COLS).order('created_at', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const latest = useMemo(() => {
    const by = {}
    ;(rows || []).filter((r) => r.status === 'published').forEach((r) => { (by[r.lineage_id] ||= []).push(r) })
    return Object.values(by).map((v) => v.sort((x, y) => y.version - x.version)).map((v) => ({ pkg: v[0], older: v.length - 1 }))
      .sort((x, y) => new Date(y.pkg.created_at) - new Date(x.pkg.created_at))
  }, [rows])
  const trades = [...new Set(latest.map((x) => x.pkg.trade_name))].sort()
  const shown = latest.filter(({ pkg }) =>
    (!trade || pkg.trade_name === trade) &&
    (!q || (pkg.title + ' ' + pkg.description + ' ' + pkg.source_iti_name + ' ' + pkg.publisher_name).toLowerCase().includes(q.toLowerCase())))

  const mine = (rows || []).filter((r) => r.published_by === a.session.user.id || a.adminItiIds.includes(r.source_iti_id))

  if (!rows) return <Spinner />
  return (
    <>
      <div className="row between wrap gap">
        <div><h1>🗂️ Shared repository</h1><p className="muted">Ready-made learning outcomes, split-ups, job tasks and lesson notes shared by instructors. Copy what you need and make it your own.</p></div>
        {d.canEdit && d.los.length > 0 && <button className="btn primary" onClick={() => setPub(true)}>⬆ Share {d.trade?.name}…</button>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'browse', label: 'Browse', count: latest.length }, { id: 'mine', label: 'My shared', count: mine.length }]} />

      {tab === 'browse' && <>
        <div className="row gap wrap mb">
          <input placeholder="Search title, ITI, person…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} aria-label="Search" />
          <select value={trade} onChange={(e) => setTrade(e.target.value)} style={{ width: 'auto' }} aria-label="Trade filter"><option value="">All trades</option>{trades.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        {!shown.length ? <Empty>{latest.length ? 'Nothing matches your search.' : 'Nothing has been shared yet. Be the first — open a trade and press “Share to repository”.'}</Empty> : (
          <div className="col gap-s">
            {shown.map(({ pkg, older }) => (
              <Card key={pkg.id} pkg={pkg} older={older}>
                <button className="btn sm" onClick={() => setPrev(pkg)}>Preview</button>
                <button className="btn sm primary" onClick={() => setUse(pkg)}>Use a copy…</button>
              </Card>
            ))}
          </div>
        )}
      </>}

      {tab === 'mine' && (!mine.length ? <Empty>You have not shared anything yet.</Empty> : (
        <div className="col gap-s">
          {mine.map((pkg) => (
            <Card key={pkg.id} pkg={pkg}>
              <button className="btn sm" onClick={() => setPrev(pkg)}>Preview</button>
              <button className="btn sm" onClick={() => run(async () => { await rpc('set_package_status', { p_id: pkg.id, p_status: pkg.status === 'published' ? 'withdrawn' : 'published' }); await load() })}>
                {pkg.status === 'published' ? 'Withdraw' : 'Publish again'}
              </button>
              {a.isSuper && <button className="btn sm" onClick={async () => {
                if (await confirm({ title: 'Delete this version for good?', body: `${pkg.title} v${pkg.version}`, danger: true, confirmText: 'Delete' }))
                  run(async () => { const { error } = await supabase.from('repo_packages').delete().eq('id', pkg.id); if (error) throw error; await load() })
              }}>🗑</button>}
            </Card>
          ))}
        </div>
      ))}

      {prev && <Preview pkg={prev} onClose={() => setPrev(null)} onUse={setUse} />}
      {use && <UseCopy pkg={use} onClose={() => setUse(null)} onUse={onUse} />}
      {pub && <PublishModal onClose={() => setPub(false)} onDone={() => { load(); setTab('mine') }} />}
    </>
  )
}
