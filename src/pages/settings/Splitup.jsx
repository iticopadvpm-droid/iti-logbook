/**
 * Splitup.jsx — Two ways to build a split-up:
 *   1. Upload Excel (official GOVT. ITI format)
 *   2. Create directly in the app (form-based tree builder)
 */
import { useRef, useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Empty, Field, Modal, Tabs, useAction, useToast } from '../../components/ui'

// ════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ════════════════════════════════════════════════════════════════════

// ── Core import function (shared by both methods) ───────────────────
async function importData(tradeId, parsed, existingLos) {
  const existingNums = new Set(existingLos.map((l) => l.number))
  let loSort = existingLos.length

  async function upsertLo(lo) {
    if (existingNums.has(lo.number)) {
      const { data } = await supabase.from('learning_outcomes')
        .select('id, number').eq('trade_id', tradeId).eq('number', lo.number).maybeSingle()
      return data
    }
    const { data, error } = await supabase.from('learning_outcomes')
      .insert({ trade_id: tradeId, number: lo.number, title: lo.title, sort_order: ++loSort })
      .select().single()
    if (error) throw new Error(error.message)
    return data
  }

  async function upsertItems(loRow, items, kind) {
    const { data: existingItems } = await supabase.from('splitup_items')
      .select('id, number, kind').eq('lo_id', loRow.id)
    const existNums = new Set((existingItems || []).filter((i) => i.kind === kind).map((i) => i.number))
    let itemSort = (existingItems || []).filter((i) => i.kind === kind).length

    for (const item of items) {
      let itemRow
      if (existNums.has(item.number)) {
        itemRow = (existingItems || []).find((i) => i.kind === kind && i.number === item.number)
      } else {
        const { data, error } = await supabase.from('splitup_items')
          .insert({ lo_id: loRow.id, kind, number: item.number, title: item.title, sort_order: ++itemSort })
          .select().single()
        if (error) throw new Error(error.message)
        itemRow = data
      }
      if (!itemRow || !item.tasks?.length) continue

      const { data: existTasks } = await supabase.from('tasks').select('number').eq('item_id', itemRow.id)
      const existTNums = new Set((existTasks || []).map((t) => t.number))
      const newTasks = item.tasks
        .filter((t) => !existTNums.has(t.number))
        .map((t, i) => ({ item_id: itemRow.id, number: t.number, name: t.name, sort_order: (existTasks?.length || 0) + i + 1 }))
      if (newTasks.length) {
        const { error } = await supabase.from('tasks').insert(newTasks)
        if (error) throw new Error(error.message)
      }
    }
  }

  for (const lo of (parsed.practical || [])) {
    const loRow = await upsertLo(lo)
    if (loRow) await upsertItems(loRow, lo.items, 'practical')
  }
  for (const lo of (parsed.theory || [])) {
    const loRow = await upsertLo(lo)
    if (loRow) await upsertItems(loRow, lo.items, 'theory')
  }
}

// ── Conflict modal (shared) ─────────────────────────────────────────
function ConflictModal({ tradeId, existing, incoming, onClose, onDone }) {
  const [mode, setMode] = useState('skip')
  const [run, busy] = useAction()
  const toast = useToast()

  const save = () => run(async () => {
    if (mode === 'replace') {
      const { error } = await supabase.from('learning_outcomes').delete().eq('trade_id', tradeId)
      if (error) throw new Error(error.message)
    }
    await importData(tradeId, incoming, mode === 'skip' ? existing : [])
    toast('Import complete!')
    onDone(); onClose()
  }, 'Importing…')

  return (
    <Modal title="Existing syllabus found" onClose={onClose} small>
      <p>This trade already has {existing.length} learning outcome{existing.length > 1 ? 's' : ''}.
        How should existing items be handled?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} style={{ marginTop: 2 }} />
          <div><b>Skip duplicates</b>
            <div className="muted small">Only add items whose number doesn't exist yet. Safe choice.</div></div>
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} style={{ marginTop: 2 }} />
          <div><b style={{ color: 'var(--danger)' }}>Replace everything</b>
            <div className="muted small">Delete the whole existing syllabus and import fresh.</div></div>
        </label>
      </div>
      <div className="row end gap">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={save}>Import</button>
      </div>
    </Modal>
  )
}

// ── Trade selector (shared) ─────────────────────────────────────────
function TradeSelect({ value, onChange, trades }) {
  if (trades.length <= 1) return null
  return (
    <Field label="Trade">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {trades.map((t) => <option key={t.id} value={t.id}>{t.name}{t.code ? ` (${t.code})` : ''}</option>)}
      </select>
    </Field>
  )
}

// ════════════════════════════════════════════════════════════════════
// METHOD 1 — UPLOAD EXCEL
// ════════════════════════════════════════════════════════════════════

function parseSheet(ws) {
  const ref = ws['!ref']
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const maxRow = range.e.r
  const DATA_START = 8
  const cell = (r, c) => {
    const v = ws[XLSX.utils.encode_cell({ r, c })]?.v
    return v === null || v === undefined ? '' : String(v).trim()
  }
  const los = []
  let curLo = null, curItem = null
  let loNum = '', itemNum = '', itemName = ''

  for (let r = DATA_START; r <= maxRow; r++) {
    const rawLoNo = cell(r, 3), rawLoName = cell(r, 4)
    const rawItemNo = cell(r, 5), rawItemName = cell(r, 6)
    const rawTaskNo = cell(r, 7), rawTaskName = cell(r, 8)
    const anyVal = rawLoNo || rawLoName || rawItemNo || rawItemName || rawTaskNo || rawTaskName
    if (!anyVal) continue
    if (/total\s*(outcome|lo|job|lesson|task|topic)/i.test(rawLoName || rawTaskName || rawLoNo)) continue
    if (/signature|principal|instructor|head of dept/i.test(rawLoName || rawTaskName || rawLoNo)) continue

    if (rawLoNo) { loNum = rawLoNo }
    if (rawItemNo) { itemNum = rawItemNo }
    if (rawItemName) { itemName = rawItemName }

    if (rawLoNo) {
      curLo = { number: rawLoNo, title: rawLoName || '', items: [] }
      los.push(curLo); curItem = null; itemNum = ''; itemName = ''
    }
    if (rawItemNo) {
      if (!curLo) { curLo = { number: '', title: '', items: [] }; los.push(curLo) }
      curItem = { number: rawItemNo, title: rawItemName || '', tasks: [] }
      curLo.items.push(curItem)
    }
    if (rawTaskNo && rawTaskName) {
      if (!curItem && curLo?.items.length) curItem = curLo.items[curLo.items.length - 1]
      if (curItem) curItem.tasks.push({ number: rawTaskNo, name: rawTaskName })
    }
  }
  return los
}

function parseSplitup(wb) {
  const practical = wb.SheetNames.find((n) => /splitup\s*p/i.test(n) || /practical/i.test(n))
  const theory    = wb.SheetNames.find((n) => /splitup\s*tt?/i.test(n) || /theory/i.test(n))
  return {
    practical: practical ? parseSheet(wb.Sheets[practical]) : [],
    theory:    theory    ? parseSheet(wb.Sheets[theory])    : [],
    sheetNames: wb.SheetNames,
  }
}

function PreviewLo({ lo }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: 6 }}>
      <div onClick={() => setOpen((v) => !v)}
        style={{ cursor: 'pointer', padding: '5px 8px', borderRadius: 4, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700, minWidth: 32 }}>{lo.number}</span>
        <span style={{ flex: 1 }}>{lo.title || <em className="muted">no name</em>}</span>
        <span className="muted small">{lo.items.length} items</span>
        <span>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ marginLeft: 16, marginTop: 4 }}>
          {lo.items.map((item) => (
            <div key={item.number} style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', gap: 8, padding: '3px 8px', background: 'var(--soft)', borderRadius: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent)', minWidth: 40 }}>{item.number}</span>
                <span style={{ flex: 1 }}>{item.title || <em className="muted">no name</em>}</span>
                <span className="muted small">{item.tasks.length} tasks</span>
              </div>
              {item.tasks.map((t) => (
                <div key={t.number} style={{ display: 'flex', gap: 8, padding: '2px 8px 2px 24px', fontSize: 12, color: 'var(--muted)' }}>
                  <span style={{ minWidth: 50 }}>{t.number}</span><span>{t.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UploadMethod({ tradeId, setTradeId, editableTrades }) {
  const fileRef = useRef()
  const toast = useToast()
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(null)
  const [run, busy] = useAction()

  function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    setError(''); setParsed(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const result = parseSplitup(wb)
        if (!result.practical.length && !result.theory.length) {
          setError('No data found. Make sure the file has "splitup p" and/or "splitup tt" sheets with data rows starting at row 9.')
          return
        }
        setParsed(result)
      } catch (err) { setError('Could not read the file: ' + err.message) }
    }
    reader.readAsArrayBuffer(file); e.target.value = ''
  }

  function handleImport() {
    if (!parsed || !tradeId) return
    run(async () => {
      const { data: existingLos, error: fetchErr } = await supabase
        .from('learning_outcomes').select('id, number, title').eq('trade_id', tradeId)
      if (fetchErr) throw new Error(fetchErr.message)
      if (existingLos?.length) {
        setConflict({ existing: existingLos, incoming: parsed })
      } else {
        await importData(tradeId, parsed, [])
        toast('Import complete!')
        setParsed(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    }, 'Checking…')
  }

  const clear = () => { setParsed(null); if (fileRef.current) fileRef.current.value = '' }

  return (
    <>
      <div className="card">
        <div className="card-head"><h2>Upload Excel file</h2></div>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Upload your split-up Excel file (<b>official GOVT. ITI format</b> — sheets named{' '}
          <code>splitup p</code> and <code>splitup tt</code>). LOs, jobs/lessons, and tasks/topics
          will be imported automatically.
        </p>
        <TradeSelect value={tradeId} onChange={(v) => { setTradeId(v); setParsed(null) }} trades={editableTrades} />
        <Field label="Select Excel file (.xlsx)">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} />
        </Field>
        {error && <div style={{ background: '#fff0f0', color: 'var(--danger)', borderRadius: 6, padding: '8px 12px', marginTop: 8, fontSize: 13 }}>⚠️ {error}</div>}
        {parsed && (
          <>
            <div style={{ background: 'var(--accent-soft)', borderRadius: 6, padding: '8px 12px', marginTop: 8, fontSize: 13 }}>
              ✅ File read — sheets: <b>{parsed.sheetNames.join(', ')}</b>
            </div>
            <div style={{ marginTop: 10 }}>
              {['practical','theory'].map((k) => (parsed[k] || []).map((lo) => <PreviewLo key={lo.number+k} lo={lo} />))}
            </div>
            <div className="row end gap" style={{ marginTop: 12 }}>
              <button className="btn" onClick={clear}>Clear</button>
              <button className="btn primary" disabled={busy || !tradeId} onClick={handleImport}>
                Import into {editableTrades.find((t) => t.id === tradeId)?.name || 'trade'}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Download blank template</h2></div>
        <p className="muted small">Use this template as a starting point. Fill your trade name, then replace sample rows with your syllabus content.</p>
        <a href="https://github.com/iticopadvpm-droid/iti-logbook/raw/main/public/ITI_Splitup_Template.xlsx"
          className="btn" download target="_blank" rel="noreferrer">⬇️ Download template</a>
      </div>
      {conflict && (
        <ConflictModal tradeId={tradeId} existing={conflict.existing} incoming={conflict.incoming}
          onClose={() => setConflict(null)} onDone={clear} />
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// METHOD 2 — CREATE IN APP
// ════════════════════════════════════════════════════════════════════

// ── Helpers for unique IDs in local state ───────────────────────────
let _uid = 0
const uid = () => ++_uid

const emptyTask = () => ({ _id: uid(), number: '', name: '' })
const emptyItem = (loNum, idx) => ({ _id: uid(), number: `${loNum}.${idx + 1}`, title: '', tasks: [emptyTask()] })
const emptyLo   = (idx) => ({ _id: uid(), number: String(idx + 1), title: '', items: [emptyItem(String(idx + 1), 0)] })

// ── Task row ────────────────────────────────────────────────────────
function TaskRow({ task, onChange, onDelete, canDelete }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
      <input value={task.number} onChange={(e) => onChange({ ...task, number: e.target.value })}
        placeholder="No." style={{ width: 70, fontSize: 12 }} />
      <input value={task.name} onChange={(e) => onChange({ ...task, name: e.target.value })}
        placeholder="Task / Topic name" style={{ flex: 1, fontSize: 12 }} />
      {canDelete && <button className="icon-btn" onClick={onDelete} title="Remove task" style={{ fontSize: 14 }}>✕</button>}
    </div>
  )
}

// ── Item (Job / Lesson) card ────────────────────────────────────────
function ItemCard({ item, kind, onChange, onDelete, canDelete }) {
  const word = kind === 'practical' ? 'Job' : 'Lesson'
  const taskWord = kind === 'practical' ? 'Task' : 'Topic'

  function changeTask(idx, t) {
    const tasks = item.tasks.map((x, i) => i === idx ? t : x)
    onChange({ ...item, tasks })
  }
  function removeTask(idx) {
    onChange({ ...item, tasks: item.tasks.filter((_, i) => i !== idx) })
  }
  function addTask() {
    const last = item.tasks[item.tasks.length - 1]
    const parts = last?.number?.split('.') || []
    const nextNum = parts.length >= 2
      ? `${parts.slice(0, -1).join('.')}.${Number(parts[parts.length - 1]) + 1}`
      : `${item.number}.${item.tasks.length + 1}`
    onChange({ ...item, tasks: [...item.tasks, { _id: uid(), number: nextNum, name: '' }] })
  }

  return (
    <div style={{ border: '1px solid var(--soft)', borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <input value={item.number} onChange={(e) => onChange({ ...item, number: e.target.value })}
          placeholder={`${word} No.`} style={{ width: 80, fontWeight: 600 }} />
        <input value={item.title} onChange={(e) => onChange({ ...item, title: e.target.value })}
          placeholder={`${word} name`} style={{ flex: 1 }} />
        {canDelete && <button className="icon-btn" onClick={onDelete} title={`Remove ${word}`}>🗑</button>}
      </div>
      <div style={{ marginLeft: 8 }}>
        <div className="muted small" style={{ marginBottom: 4 }}>{taskWord}s:</div>
        {item.tasks.map((t, i) => (
          <TaskRow key={t._id} task={t} onChange={(v) => changeTask(i, v)}
            onDelete={() => removeTask(i)} canDelete={item.tasks.length > 1} />
        ))}
        <button className="btn sm" style={{ marginTop: 4 }} onClick={addTask}>＋ {taskWord}</button>
      </div>
    </div>
  )
}

// ── LO card ─────────────────────────────────────────────────────────
function LoCard({ lo, onChange, onDelete, canDelete }) {
  const [pracOpen, setPracOpen] = useState(true)
  const [theoOpen, setTheoOpen] = useState(true)

  function changeItem(kind, idx, item) {
    onChange({ ...lo, [kind]: lo[kind].map((x, i) => i === idx ? item : x) })
  }
  function removeItem(kind, idx) {
    onChange({ ...lo, [kind]: lo[kind].filter((_, i) => i !== idx) })
  }
  function addItem(kind) {
    const list = lo[kind]
    const last = list[list.length - 1]
    const parts = last?.number?.split('.') || []
    const nextNum = parts.length >= 1
      ? `${lo.number}.${Number(parts[parts.length - 1]) + 1}`
      : `${lo.number}.${list.length + 1}`
    const word = kind === 'practical' ? 'Job' : 'Lesson'
    onChange({ ...lo, [kind]: [...list, { _id: uid(), number: nextNum, title: '', tasks: [emptyTask()] }] })
  }

  return (
    <div style={{ border: '2px solid var(--accent)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
      {/* LO header */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>LO</span>
        <input value={lo.number} onChange={(e) => onChange({ ...lo, number: e.target.value })}
          placeholder="LO No." style={{ width: 70, fontWeight: 700 }} />
        <input value={lo.title} onChange={(e) => onChange({ ...lo, title: e.target.value })}
          placeholder="Learning Outcome title" style={{ flex: 1 }} />
        {canDelete && <button className="icon-btn" onClick={onDelete} title="Remove LO" style={{ color: 'var(--danger)' }}>🗑</button>}
      </div>

      {/* Practical section */}
      <div style={{ marginBottom: 10 }}>
        <div className="row between" style={{ cursor: 'pointer', marginBottom: 6 }} onClick={() => setPracOpen((v) => !v)}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>🛠️ Practical — Jobs ({lo.practical.length})</span>
          <span className="muted">{pracOpen ? '▾' : '▸'}</span>
        </div>
        {pracOpen && (
          <>
            {lo.practical.map((item, i) => (
              <ItemCard key={item._id} item={item} kind="practical"
                onChange={(v) => changeItem('practical', i, v)}
                onDelete={() => removeItem('practical', i)}
                canDelete={lo.practical.length > 1} />
            ))}
            <button className="btn sm primary" onClick={() => addItem('practical')}>＋ Job</button>
          </>
        )}
      </div>

      {/* Theory section */}
      <div>
        <div className="row between" style={{ cursor: 'pointer', marginBottom: 6 }} onClick={() => setTheoOpen((v) => !v)}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>📖 Theory — Lessons ({lo.theory.length})</span>
          <span className="muted">{theoOpen ? '▾' : '▸'}</span>
        </div>
        {theoOpen && (
          <>
            {lo.theory.map((item, i) => (
              <ItemCard key={item._id} item={item} kind="theory"
                onChange={(v) => changeItem('theory', i, v)}
                onDelete={() => removeItem('theory', i)}
                canDelete={lo.theory.length > 1} />
            ))}
            <button className="btn sm primary" onClick={() => addItem('theory')}>＋ Lesson</button>
          </>
        )}
      </div>
    </div>
  )
}

// Convert local state to the parsed format importData() expects
function localToParsed(los) {
  const practical = [], theory = []
  for (const lo of los) {
    if (lo.practical?.length) {
      practical.push({ number: lo.number, title: lo.title, items: lo.practical })
    }
    if (lo.theory?.length) {
      theory.push({ number: lo.number, title: lo.title, items: lo.theory })
    }
  }
  return { practical, theory }
}

function makeDefaultLos() {
  return [1].map((_, i) => ({
    _id: uid(), number: String(i + 1), title: '',
    practical: [{ _id: uid(), number: `${i + 1}.1`, title: '', tasks: [emptyTask()] }],
    theory:    [{ _id: uid(), number: `${i + 1}.1`, title: '', tasks: [emptyTask()] }],
  }))
}

function CreateMethod({ tradeId, setTradeId, editableTrades }) {
  const toast = useToast()
  const [los, setLos] = useState(makeDefaultLos)
  const [conflict, setConflict] = useState(null)
  const [run, busy] = useAction()

  function changeLo(idx, lo) { setLos((prev) => prev.map((x, i) => i === idx ? lo : x)) }
  function removeLo(idx)      { setLos((prev) => prev.filter((_, i) => i !== idx)) }
  function addLo() {
    const last = los[los.length - 1]
    const nextNum = last ? String(Number(last.number) + 1) : '1'
    setLos((prev) => [...prev, {
      _id: uid(), number: nextNum, title: '',
      practical: [{ _id: uid(), number: `${nextNum}.1`, title: '', tasks: [emptyTask()] }],
      theory:    [{ _id: uid(), number: `${nextNum}.1`, title: '', tasks: [emptyTask()] }],
    }])
  }

  function handleSave() {
    // Validate: every LO must have a number
    const bad = los.find((lo) => !lo.number.trim())
    if (bad) { toast('Every LO must have a number.'); return }

    run(async () => {
      const { data: existingLos, error: fetchErr } = await supabase
        .from('learning_outcomes').select('id, number, title').eq('trade_id', tradeId)
      if (fetchErr) throw new Error(fetchErr.message)
      const parsed = localToParsed(los)
      if (existingLos?.length) {
        setConflict({ existing: existingLos, incoming: parsed })
      } else {
        await importData(tradeId, parsed, [])
        toast('Syllabus saved!')
        setLos(makeDefaultLos())
      }
    }, 'Saving…')
  }

  // Count totals for the footer
  const totalLos = los.length
  const totalJobs = los.reduce((s, lo) => s + lo.practical.length, 0)
  const totalLessons = los.reduce((s, lo) => s + lo.theory.length, 0)
  const totalTasks = los.reduce((s, lo) =>
    s + lo.practical.reduce((ss, it) => ss + it.tasks.length, 0)
      + lo.theory.reduce((ss, it) => ss + it.tasks.length, 0), 0)

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Create split-up in app</h2>
          <span className="muted small">{totalLos} LOs · {totalJobs} jobs · {totalLessons} lessons · {totalTasks} tasks</span>
        </div>
        <p className="muted small" style={{ marginBottom: 14 }}>
          Add Learning Outcomes, then add Jobs (practical) and Lessons (theory) under each LO,
          and Tasks / Topics under each Job / Lesson. Click <b>Save to trade</b> when done.
        </p>
        <TradeSelect value={tradeId} onChange={setTradeId} trades={editableTrades} />

        {los.map((lo, i) => (
          <LoCard key={lo._id} lo={lo}
            onChange={(v) => changeLo(i, v)}
            onDelete={() => removeLo(i)}
            canDelete={los.length > 1} />
        ))}

        <div className="row between gap" style={{ marginTop: 8 }}>
          <button className="btn" onClick={addLo}>＋ Add LO</button>
          <button className="btn primary" disabled={busy || !tradeId} onClick={handleSave}>
            💾 Save to trade
          </button>
        </div>
      </div>

      {conflict && (
        <ConflictModal tradeId={tradeId} existing={conflict.existing} incoming={conflict.incoming}
          onClose={() => setConflict(null)} onDone={() => setLos(makeDefaultLos())} />
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════
export default function Splitup() {
  const a = useAuth()
  const [method, setMethod] = useState('create')  // 'create' | 'upload'
  const editableTrades = a.trades.filter((t) => a.canEditTrade(t))
  const [tradeId, setTradeId] = useState(editableTrades[0]?.id || '')

  if (!editableTrades.length) {
    return <Empty>You are not an editor of any trade. Ask an admin to grant you access.</Empty>
  }

  const tabs = [
    { id: 'create', label: '✏️ Create in app' },
    { id: 'upload', label: '📂 Upload Excel' },
  ]

  return (
    <>
      <Tabs tabs={tabs} value={method} onChange={setMethod} />
      <div style={{ marginTop: 16 }}>
        {method === 'create'
          ? <CreateMethod tradeId={tradeId} setTradeId={setTradeId} editableTrades={editableTrades} />
          : <UploadMethod tradeId={tradeId} setTradeId={setTradeId} editableTrades={editableTrades} />
        }
      </div>
    </>
  )
}
