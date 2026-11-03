import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { del, ins, upd } from '../lib/api'
import { useData } from '../lib/data'
import { supabase } from '../lib/supabase'
import { DAYS, addDays, addWeeks, courseWeekNo, fmtDate, mondayOf, startWeek, today, weekLabel } from '../lib/dates'
import { natCmp } from '../lib/util'
import { Empty, Field, Modal, useAction, useConfirm, useToast } from '../components/ui'

const BLOCK = 3

// ── number → suggestion box ────────────────────────────────────────────
function Suggest({ anchor, items, index, onPick }) {
  if (!anchor || !items.length) return null
  const r = anchor.getBoundingClientRect()
  const w = Math.min(420, window.innerWidth - 16)
  const h = Math.min(260, items.length * 34)
  const top = r.bottom + h + 8 > window.innerHeight && r.top > h + 8 ? r.top - h - 2 : r.bottom + 2
  return (
    <div className="suggest" style={{ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top, width: w }}>
      {items.map((x, i) => (
        <div key={x.id} className={i === index ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); onPick(x) }}><b>{x.number}</b><span>{x.title}</span></div>
      ))}
    </div>
  )
}

function useSuggest(list) {
  const [s, setS] = useState({ el: null, kind: null, q: '', i: -1, pick: null })
  const items = useMemo(() => {
    if (!s.el) return []
    const q = s.q.trim().toLowerCase()
    return list(s.kind).filter((x) => !q || x.number.toLowerCase().startsWith(q) || x.title.toLowerCase().includes(q)).slice(0, 60)
  }, [s, list])
  useEffect(() => { const h = () => setS((x) => ({ ...x, el: null })); window.addEventListener('scroll', h, true); return () => window.removeEventListener('scroll', h, true) }, [])
  const choose = (it) => { const p = s.pick; setS((x) => ({ ...x, el: null, i: -1 })); p?.(it) }
  return {
    open: (el, kind, pick) => setS({ el, kind, q: el.value, i: -1, pick }),
    type: (el, kind, pick) => setS({ el, kind, q: el.value, i: -1, pick }),
    close: () => setS((x) => ({ ...x, el: null, i: -1 })),
    key: (e) => {
      if (!s.el || !items.length) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setS({ ...s, i: Math.min(items.length - 1, s.i + 1) }) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setS({ ...s, i: Math.max(0, s.i - 1) }) }
      else if (e.key === 'Enter' && s.i >= 0) { e.preventDefault(); choose(items[s.i]) }
      else if (e.key === 'Escape') setS({ ...s, el: null })
    },
    node: <Suggest anchor={s.el} items={items} index={s.i} onPick={choose} />,
  }
}

// ── one day row ────────────────────────────────────────────────────────
function DayRow({ diary, week, idx, entry, editing, sg, lookup, onSave }) {
  const date = entry?.entry_date || addDays(week, idx)
  const [v, setV] = useState({ pn: entry?.practical_no ?? '', pt: entry?.practical_title ?? '', tn: entry?.theory_no ?? '', tt: entry?.theory_title ?? '', dt: date })
  const base = useRef(v)
  useEffect(() => {
    const n = { pn: entry?.practical_no ?? '', pt: entry?.practical_title ?? '', tn: entry?.theory_no ?? '', tt: entry?.theory_title ?? '', dt: entry?.entry_date || addDays(week, idx) }
    setV(n); base.current = n
  }, [entry?.updated_at, entry?.id, week, idx, entry?.entry_date])  // eslint-disable-line

  function commit(next) {
    const b = base.current
    if (['pn', 'pt', 'tn', 'tt', 'dt'].every((k) => next[k] === b[k])) return
    base.current = next
    onSave({
      diary_id: diary.id, week_start: week, day_idx: idx, entry_date: next.dt || addDays(week, idx),
      practical_no: next.pn, practical_title: next.pt, practical_item_id: lookup('practical', next.pn)?.id ?? null,
      theory_no: next.tn, theory_title: next.tt, theory_item_id: lookup('theory', next.tn)?.id ?? null,
    })
  }
  // number typed or picked → fetch the name, but never overwrite a title the instructor edited by hand
  function numberChanged(kind, no, forced) {
    const pk = kind === 'practical'
    const ok = pk ? 'pn' : 'tn', tk = pk ? 'pt' : 'tt'
    const prevName = lookup(kind, base.current[ok])?.title
    const found = forced || lookup(kind, no)
    const n = { ...v, [ok]: no }
    if (found && (!v[tk] || v[tk] === prevName)) n[tk] = found.title
    setV(n); commit(n)
  }
  const pickFor = (kind, it) => numberChanged(kind, it.number, it)

  if (!editing) {
    return (
      <tr><td><b>{DAYS[idx]}</b></td><td>{fmtDate(date)}</td><td>{v.pn}</td><td>{v.pt}</td><td>{v.tn}</td><td>{v.tt}</td></tr>
    )
  }
  const noInput = (kind, k) => (
    <input value={v[k]} autoComplete="off" aria-label={kind === 'practical' ? 'Exercise number' : 'Lesson number'}
      onChange={(e) => { setV({ ...v, [k]: e.target.value }); sg.type(e.target, kind, (it) => pickFor(kind, it)) }}
      onFocus={(e) => sg.open(e.target, kind, (it) => pickFor(kind, it))} onKeyDown={sg.key} onBlur={(e) => { sg.close(); numberChanged(kind, e.target.value.trim()) }} />
  )
  return (
    <tr>
      <td><b>{DAYS[idx]}</b></td>
      <td>
        <span className="dp-view">{fmtDate(v.dt)}</span>
        <span className="dp-edit">{fmtDate(v.dt)}<br /><input type="date" aria-label="Date" value={v.dt} style={{ width: 118, fontSize: 11, padding: '2px 4px', marginTop: 3 }}
          onChange={(e) => { const n = { ...v, dt: e.target.value }; setV(n); commit(n) }} /></span>
      </td>
      <td><span className="dp-view">{v.pn}</span><span className="dp-edit">{noInput('practical', 'pn')}</span></td>
      <td><span className="dp-view">{v.pt}</span><span className="dp-edit"><textarea rows={2} aria-label="Practical job title" value={v.pt} onChange={(e) => setV({ ...v, pt: e.target.value })} onBlur={() => commit(v)} /></span></td>
      <td><span className="dp-view">{v.tn}</span><span className="dp-edit">{noInput('theory', 'tn')}</span></td>
      <td><span className="dp-view">{v.tt}</span><span className="dp-edit"><textarea rows={2} aria-label="Theory lesson title" value={v.tt} onChange={(e) => setV({ ...v, tt: e.target.value })} onBlur={() => commit(v)} /></span></td>
    </tr>
  )
}

function WeekBlock({ diary, week, entries, editing, sg, lookup, onSave, onClear }) {
  const map = {}; entries.forEach((e) => { if (e.week_start === week) map[e.day_idx] = e })
  return (
    <div className="dp-block">
      <div className="dp-week">
        <span>{weekLabel(week, diary.class_start_date)}</span>
        <span>{fmtDate(week)} – {fmtDate(addDays(week, 5))}</span>
        {editing && <button className="btn sm no-print" onClick={() => onClear(week)}>🗑 Clear week</button>}
      </div>
      <table className="dp-table">
        <thead><tr><th style={{ width: 46 }}>Day</th><th style={{ width: editing ? 126 : 76 }}>Date</th><th style={{ width: 62 }}>Ex. No.</th><th>Practical job title</th><th style={{ width: 66 }}>Lesson No.</th><th>Theory lesson title</th></tr></thead>
        <tbody>{DAYS.map((_, i) => <DayRow key={i} diary={diary} week={week} idx={i} entry={map[i]} editing={editing} sg={sg} lookup={lookup} onSave={onSave} />)}</tbody>
      </table>
    </div>
  )
}

function DiaryForm({ diary, onClose, onSaved }) {
  const d = useData()
  const [name, setName] = useState(diary?.name ?? '')
  const [start, setStart] = useState(diary?.class_start_date ?? '')
  const [run, busy] = useAction()
  return (
    <Modal title={diary ? 'Diary settings' : 'Add diary'} onClose={onClose} small>
      <form onSubmit={(e) => { e.preventDefault(); run(async () => {
        const row = { name: name.trim(), class_start_date: start || null }
        if (!row.name) throw new Error('Give the diary a name.')
        const r = diary ? await upd('diaries', diary.id, row) : await ins('diaries', { ...row, trade_id: d.tradeId, sort_order: d.diaries.length + 1 })
        await d.reload(); onSaved?.(r); onClose()
      }, diary ? 'Saved' : 'Diary added') }}>
        <Field label="Diary name" hint="e.g. COPA A Batch, 2026–27 First year"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Class start date" hint="Week 1 is the week that contains this date."><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <div className="row end gap"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  )
}

export default function Diary({ printAll }) {
  const d = useData()
  const nav = useNavigate()
  const { diaryId } = useParams()
  const [sp, setSp] = useSearchParams()
  const confirm = useConfirm()
  const toast = useToast()
  const [run] = useAction()
  const [form, setForm] = useState(null)
  const diary = d.diaries.find((x) => x.id === diaryId) || (!diaryId ? d.diaries[0] : null)
  const entries = diary ? d.entriesByDiary[diary.id] || [] : []

  // lookups into the syllabus (numbers are text, so 1.1 and 1.10 never mix up)
  const lookup = useMemo(() => {
    const m = { practical: {}, theory: {} }
    d.items.forEach((i) => { m[i.kind][i.number] ||= i })
    return (kind, no) => m[kind][String(no || '').trim()]
  }, [d.items])
  const list = useMemo(() => (kind) => [...(kind === 'practical' ? d.practical : d.theory)].sort((a, b) => natCmp(a.number, b.number)), [d.practical, d.theory])
  const sg = useSuggest(list)

  const thisMonday = mondayOf(new Date())
  const defaultStart = useMemo(() => {
    if (!diary) return thisMonday
    const sw = startWeek(diary.class_start_date)
    if (!sw) return addWeeks(thisMonday, -1)
    const n = courseWeekNo(thisMonday, diary.class_start_date)
    return n >= 1 ? addWeeks(sw, Math.floor((n - 1) / BLOCK) * BLOCK) : sw
  }, [diary, thisMonday])
  const start = mondayOf(sp.get('w') || defaultStart)
  const goto = (w) => setSp({ w }, { replace: true })
  const weeks = Array.from({ length: BLOCK }, (_, i) => addWeeks(start, i))

  function save(row) {
    run(async () => {
      const { error } = await supabase.from('diary_entries').upsert(row, { onConflict: 'diary_id,week_start,day_idx' })
      if (error) throw new Error(error.message)
      await d.reload()
    })
  }
  async function clearWeek(w) {
    if (!(await confirm({ title: 'Clear this week?', body: `Delete all diary entries of the week starting ${fmtDate(w)}.`, danger: true, confirmText: 'Clear week' }))) return
    run(async () => {
      const { error } = await supabase.from('diary_entries').delete().eq('diary_id', diary.id).eq('week_start', w)
      if (error) throw new Error(error.message)
      await d.reload()
    }, 'Week cleared')
  }
  async function removeDiary() {
    if (!(await confirm({ title: `Delete “${diary.name}”?`, body: 'All its entries are deleted.', danger: true, confirmText: 'Delete', typeToConfirm: diary.name }))) return
    run(async () => { await del('diaries', diary.id); await d.reload(); nav(`${d.base}/diary`) }, 'Diary deleted')
  }

  if (!d.diaries.length) {
    return (
      <>
        <h1>Student diary</h1>
        <div className="mt"><Empty>
          No diary has been created for this trade yet.
          {d.editing ? <div style={{ marginTop: 10 }}><button className="btn primary" onClick={() => setForm({})}>＋ Add diary</button></div> : d.canEdit ? <div className="small">Switch on Edit mode to add one.</div> : null}
        </Empty></div>
        {form && <DiaryForm onClose={() => setForm(null)} onSaved={(r) => nav(`/diary/${r.id}`)} />}
      </>
    )
  }
  if (!diary) return <Empty>Diary not found. <Link to={`${d.base}/diary`}>Open the first one</Link></Empty>

  // ── print everything: weeks that have something written, oldest first, 3 per A4 page
  if (printAll) {
    const filled = [...new Set(entries.filter((e) => e.practical_no || e.practical_title || e.theory_no || e.theory_title).map((e) => e.week_start))].sort()
    const pages = []; for (let i = 0; i < filled.length; i += BLOCK) pages.push(filled.slice(i, i + BLOCK))
    return (
      <>
        <div className="row gap mb no-print">
          <Link className="btn" to={`${d.base}/diary/${diary.id}`}>← Back to diary</Link>
          {filled.length > 0 && <button className="btn accent" onClick={() => window.print()}>🖨️ Print ({filled.length} week{filled.length > 1 ? 's' : ''} · {pages.length} A4 page{pages.length > 1 ? 's' : ''})</button>}
        </div>
        {!filled.length ? <Empty>No diary entries have been filled yet.</Empty> : pages.map((ws, i) => (
          <div className="dp-page" key={i}>
            <div className="dp-batch">{diary.name}</div>
            {ws.map((w) => <WeekBlock key={w} diary={diary} week={w} entries={entries} editing={false} sg={sg} lookup={lookup} onSave={save} onClear={clearWeek} />)}
          </div>
        ))}
      </>
    )
  }

  const opts = new Set([start, thisMonday, ...entries.map((e) => e.week_start)])
  if (startWeek(diary.class_start_date)) opts.add(startWeek(diary.class_start_date))
  return (
    <>
      <div className="row between wrap gap mb no-print">
        <h1>📔 {diary.name}</h1>
        {d.editing && <div className="row gap-s">
          <button className="btn" onClick={() => setForm(diary)}>⚙️ Name &amp; start date</button>
          <button className="btn" onClick={() => setForm({})}>＋ Add diary</button>
          <button className="btn" onClick={removeDiary}>🗑</button>
        </div>}
      </div>
      <div className="card row wrap gap no-print" style={{ padding: '10px 14px', marginBottom: 14 }}>
        <button className="btn sm" onClick={() => goto(addWeeks(start, -BLOCK))}>◀ Previous {BLOCK} weeks</button>
        <select aria-label="Start from week" style={{ width: 'auto' }} value={start} onChange={(e) => goto(e.target.value)}>
          {[...opts].sort().reverse().map((w) => <option key={w} value={w}>{weekLabel(w, diary.class_start_date)} — {fmtDate(w)}</option>)}
        </select>
        <button className="btn sm" onClick={() => goto(addWeeks(start, BLOCK))}>Next {BLOCK} weeks ▶</button>
        <span className="muted small">{fmtDate(start)} – {fmtDate(addDays(weeks[BLOCK - 1], 5))}</span>
        {diary.class_start_date && <span className="muted small">Class started <b>{fmtDate(diary.class_start_date)}</b></span>}
        <span className="grow" />
        <button className="btn sm" onClick={() => window.print()}>🖨️ Print these {BLOCK} weeks</button>
        <Link className="btn sm accent" to={`${d.base}/diary/${diary.id}/all`}>🖨️ Print all diary</Link>
      </div>
      {!diary.class_start_date && d.editing && <div className="notice warn no-print">Set the <b>class start date</b> (⚙️ above) to number the weeks from the first week of class.</div>}
      <div className="dp-page">
        <div className="dp-batch">{diary.name}</div>
        {weeks.map((w) => <WeekBlock key={w} diary={diary} week={w} entries={entries} editing={d.editing} sg={sg} lookup={lookup} onSave={save} onClear={clearWeek} />)}
      </div>
      {sg.node}
      {form && <DiaryForm diary={form.id ? form : null} onClose={() => setForm(null)} onSaved={(r) => !form.id && nav(`${d.base}/diary/${r.id}`)} />}
    </>
  )
}
