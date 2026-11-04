/**
 * Splitup.jsx — Upload & import a split-up Excel file (matches the official
 * GOVT. ITI format: `splitup p` and `splitup tt` sheets, 9-column layout,
 * sparse/merged rows, 3-level hierarchy LO → Job/Lesson → Task/Topic).
 *
 * Does NOT require the service_role key — all writes go through the normal
 * anon/user Supabase client with RLS.
 */
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { insMany } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Empty, Field, Modal, useAction, useToast } from '../../components/ui'

// ── Excel parser ────────────────────────────────────────────────────────────
/**
 * Parse one worksheet that follows the official splitup format:
 *   Row 1-5: header rows (institution, title, curriculum, standard, subject)
 *   Row 6:   blank spacer
 *   Row 7:   column headers
 *   Row 8:   hint / example row (grey italic)
 *   Row 9+:  data rows (sparse — values only on first row of each group)
 *
 * Column layout (1-indexed):
 *   1=Year  2=Month  3=Week No.  4=LO/Outcome No.  5=LO/Outcome Name
 *   6=Job/Lesson No.  7=Job/Lesson Name  8=Task/Topic No.  9=Task/Topic Name
 *
 * Returns { los: [{number, title, items:[{number, title, tasks:[{number,name}]}]}] }
 */
function parseSheet(ws) {
  const ref = ws['!ref']
  if (!ref) return []

  const range = XLSX.utils.decode_range(ref)
  const maxRow = range.e.r  // 0-indexed last row

  // Find data start row: first row after row 7 (index 6, 1-based=7) where
  // col 4 or 6 or 8 (0-indexed 3,5,7) has a value that looks like a number
  // (e.g. "1", "1.1", "1.1.1") — skip the hint row.
  // We'll start reading from row index 8 (1-based row 9, after hint row 8).
  const DATA_START = 8  // 0-indexed

  const cell = (r, c) => {
    const key = XLSX.utils.encode_cell({ r, c })
    const v = ws[key]?.v
    return v === null || v === undefined ? '' : String(v).trim()
  }

  // Walk rows, carrying forward sparse (merged/blank) values
  const los = []
  let curLo = null, curItem = null
  let loNum = '', loName = '', itemNum = '', itemName = ''

  for (let r = DATA_START; r <= maxRow; r++) {
    const rawLoNo    = cell(r, 3)   // col D — LO/Outcome No.
    const rawLoName  = cell(r, 4)   // col E — LO/Outcome Name
    const rawItemNo  = cell(r, 5)   // col F — Job/Lesson No.
    const rawItemName= cell(r, 6)   // col G — Job/Lesson Name
    const rawTaskNo  = cell(r, 7)   // col H — Task/Topic No.
    const rawTaskName= cell(r, 8)   // col I — Task/Topic Name

    // Skip completely blank rows and the total/signature section
    const anyVal = rawLoNo || rawLoName || rawItemNo || rawItemName || rawTaskNo || rawTaskName
    if (!anyVal) continue
    if (/total\s*(outcome|lo|job|lesson|task|topic)/i.test(rawLoName || rawTaskName || rawLoNo)) continue
    if (/signature|principal|instructor|head of dept/i.test(rawLoName || rawTaskName || rawLoNo)) continue

    // Update carried-forward values when non-blank
    if (rawLoNo)    loNum   = rawLoNo
    if (rawLoName)  loName  = rawLoName
    if (rawItemNo)  itemNum = rawItemNo
    if (rawItemName)itemName= rawItemName

    // If this row introduces a new LO
    if (rawLoNo) {
      curLo = { number: rawLoNo, title: rawLoName || '', items: [] }
      los.push(curLo)
      curItem = null
      itemNum = ''; itemName = ''
    }

    // If this row introduces a new Job/Lesson
    if (rawItemNo) {
      if (!curLo) {
        // Shouldn't happen in a well-formed file but be safe
        curLo = { number: '', title: '', items: [] }
        los.push(curLo)
      }
      curItem = { number: rawItemNo, title: rawItemName || '', tasks: [] }
      curLo.items.push(curItem)
    }

    // If this row has a Task/Topic
    if (rawTaskNo && rawTaskName) {
      if (!curItem) {
        // Task without a parent item — attach to current LO's last item or skip
        if (curLo && curLo.items.length) {
          curItem = curLo.items[curLo.items.length - 1]
        } else {
          continue
        }
      }
      curItem.tasks.push({ number: rawTaskNo, name: rawTaskName })
    }
  }

  return los
}

// Parse both sheets from the workbook
function parseSplitup(wb) {
  const practical = wb.SheetNames.find((n) => /splitup\s*p/i.test(n) || /practical/i.test(n))
  const theory    = wb.SheetNames.find((n) => /splitup\s*tt?/i.test(n) || /theory/i.test(n))
  return {
    practical: practical ? parseSheet(wb.Sheets[practical]) : [],
    theory:    theory    ? parseSheet(wb.Sheets[theory])    : [],
    sheetNames: wb.SheetNames,
  }
}

// ── Preview components ──────────────────────────────────────────────────────
function PreviewLo({ lo }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ cursor: 'pointer', padding: '5px 8px', borderRadius: 4,
          background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span style={{ color: 'var(--accent)', fontWeight: 700, minWidth: 32 }}>{lo.number}</span>
        <span style={{ flex: 1 }}>{lo.title || <em className="muted">no name</em>}</span>
        <span className="muted small">{lo.items.length} {lo.items.length === 1 ? 'item' : 'items'}</span>
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
                  <span style={{ minWidth: 50 }}>{t.number}</span>
                  <span>{t.name}</span>
                </div>
              ))}
            </div>
          ))}
          {!lo.items.length && <p className="muted small" style={{ padding: '4px 8px' }}>No jobs/lessons found.</p>}
        </div>
      )}
    </div>
  )
}

function PreviewPanel({ practical, theory }) {
  const [tab, setTab] = useState('practical')
  const list = tab === 'practical' ? practical : theory

  const totalItems = list.reduce((s, lo) => s + lo.items.length, 0)
  const totalTasks = list.reduce((s, lo) => lo.items.reduce((ss, it) => ss + it.tasks.length, ss), 0)

  return (
    <div style={{ marginTop: 12 }}>
      <div className="row gap-s" style={{ marginBottom: 8 }}>
        {['practical', 'theory'].map((k) => (
          <button key={k} className={`btn sm${tab === k ? ' primary' : ''}`} onClick={() => setTab(k)}>
            {k === 'practical' ? '🛠️ Practical' : '📖 Theory'}
            {' '}
            <span className="muted">({(k === 'practical' ? practical : theory).length} LOs)</span>
          </button>
        ))}
      </div>
      <div className="muted small" style={{ marginBottom: 8 }}>
        {list.length} LOs · {totalItems} {tab === 'practical' ? 'jobs' : 'lessons'} · {totalTasks} tasks/topics
      </div>
      {!list.length
        ? <Empty>No {tab} data found in the file.</Empty>
        : list.map((lo) => <PreviewLo key={lo.number} lo={lo} />)
      }
    </div>
  )
}

// ── Conflict / merge modal ──────────────────────────────────────────────────
function ConflictModal({ tradeId, existing, incoming, onClose, onDone }) {
  const [mode, setMode] = useState('skip')  // 'skip' | 'replace'
  const [run, busy] = useAction()
  const toast = useToast()

  const save = () => run(async () => {
    if (mode === 'replace') {
      // Delete all existing LOs for this trade (cascade deletes items + tasks)
      const { error } = await supabase.from('learning_outcomes').delete().eq('trade_id', tradeId)
      if (error) throw new Error(error.message)
    }
    await importData(tradeId, incoming, mode === 'skip' ? existing : [])
    toast('Import complete!')
    onDone()
    onClose()
  }, 'Importing…')

  return (
    <Modal title="Existing syllabus found" onClose={onClose} small>
      <p>This trade already has {existing.length} learning outcome{existing.length > 1 ? 's' : ''}.
        How should existing items be handled?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="radio" value="skip" checked={mode === 'skip'} onChange={() => setMode('skip')} style={{ marginTop: 2 }} />
          <div>
            <b>Skip duplicates</b>
            <div className="muted small">Only add LOs / jobs / lessons / tasks whose number doesn't exist yet. Safe choice.</div>
          </div>
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="radio" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} style={{ marginTop: 2, accentColor: 'var(--danger)' }} />
          <div>
            <b style={{ color: 'var(--danger)' }}>Replace everything</b>
            <div className="muted small">Delete the whole existing syllabus and import fresh. All diary entries that reference old jobs / lessons / tasks are unaffected but will lose their linked name.</div>
          </div>
        </label>
      </div>
      <div className="row end gap">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={save}>Import</button>
      </div>
    </Modal>
  )
}

// ── Core import function ────────────────────────────────────────────────────
async function importData(tradeId, parsed, existingLos) {
  const existingNums = new Set(existingLos.map((l) => l.number))
  let loSort = existingLos.length

  for (const lo of parsed.practical) {
    let loRow
    if (existingNums.has(lo.number)) {
      // LO already exists — look it up
      const { data } = await supabase.from('learning_outcomes')
        .select('id, number').eq('trade_id', tradeId).eq('number', lo.number).maybeSingle()
      loRow = data
    } else {
      // Insert new LO
      const { data, error } = await supabase.from('learning_outcomes')
        .insert({ trade_id: tradeId, number: lo.number, title: lo.title, sort_order: ++loSort })
        .select().single()
      if (error) throw new Error(error.message)
      loRow = data
    }
    if (!loRow) continue

    // Check existing items for this LO
    const { data: existingItems } = await supabase.from('splitup_items')
      .select('id, number, kind').eq('lo_id', loRow.id)
    const existPNums = new Set((existingItems || []).filter((i) => i.kind === 'practical').map((i) => i.number))
    let itemSort = (existingItems || []).filter((i) => i.kind === 'practical').length

    for (const item of lo.items) {
      let itemRow
      if (existPNums.has(item.number)) {
        const found = (existingItems || []).find((i) => i.kind === 'practical' && i.number === item.number)
        itemRow = found
      } else {
        const { data, error } = await supabase.from('splitup_items')
          .insert({ lo_id: loRow.id, kind: 'practical', number: item.number, title: item.title, sort_order: ++itemSort })
          .select().single()
        if (error) throw new Error(error.message)
        itemRow = data
      }
      if (!itemRow || !item.tasks.length) continue

      // Insert tasks (skip existing numbers)
      const { data: existTasks } = await supabase.from('tasks')
        .select('number').eq('item_id', itemRow.id)
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

  // ── Theory ───────────────────────────────────────────────────────────────
  for (const lo of parsed.theory) {
    let loRow
    if (existingNums.has(lo.number)) {
      const { data } = await supabase.from('learning_outcomes')
        .select('id, number').eq('trade_id', tradeId).eq('number', lo.number).maybeSingle()
      loRow = data
    } else {
      const { data, error } = await supabase.from('learning_outcomes')
        .insert({ trade_id: tradeId, number: lo.number, title: lo.title, sort_order: ++loSort })
        .select().single()
      if (error) throw new Error(error.message)
      loRow = data
    }
    if (!loRow) continue

    const { data: existingItems } = await supabase.from('splitup_items')
      .select('id, number, kind').eq('lo_id', loRow.id)
    const existTNums = new Set((existingItems || []).filter((i) => i.kind === 'theory').map((i) => i.number))
    let itemSort = (existingItems || []).filter((i) => i.kind === 'theory').length

    for (const item of lo.items) {
      let itemRow
      if (existTNums.has(item.number)) {
        const found = (existingItems || []).find((i) => i.kind === 'theory' && i.number === item.number)
        itemRow = found
      } else {
        const { data, error } = await supabase.from('splitup_items')
          .insert({ lo_id: loRow.id, kind: 'theory', number: item.number, title: item.title, sort_order: ++itemSort })
          .select().single()
        if (error) throw new Error(error.message)
        itemRow = data
      }
      if (!itemRow || !item.tasks.length) continue

      const { data: existTopics } = await supabase.from('tasks')
        .select('number').eq('item_id', itemRow.id)
      const existTopicNums = new Set((existTopics || []).map((t) => t.number))
      const newTopics = item.tasks
        .filter((t) => !existTopicNums.has(t.number))
        .map((t, i) => ({ item_id: itemRow.id, number: t.number, name: t.name, sort_order: (existTopics?.length || 0) + i + 1 }))
      if (newTopics.length) {
        const { error } = await supabase.from('tasks').insert(newTopics)
        if (error) throw new Error(error.message)
      }
    }
  }
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Splitup() {
  const a = useAuth()
  const fileRef = useRef()
  const toast = useToast()

  const [tradeId, setTradeId] = useState(a.trades.find((t) => a.canEditTrade(t))?.id || '')
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(null)  // { existing, incoming }
  const [run, busy] = useAction()

  const editableTrades = a.trades.filter((t) => a.canEditTrade(t))

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
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
      } catch (err) {
        setError('Could not read the file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    // Reset input so the same file can be re-selected after a fix
    e.target.value = ''
  }

  async function handleImport() {
    if (!parsed || !tradeId) return
    run(async () => {
      // Check for existing LOs in this trade
      const { data: existingLos, error: fetchErr } = await supabase
        .from('learning_outcomes').select('id, number, title').eq('trade_id', tradeId)
      if (fetchErr) throw new Error(fetchErr.message)

      if (existingLos?.length) {
        // Show conflict modal
        setConflict({ existing: existingLos, incoming: parsed })
      } else {
        // Fresh import — no conflicts
        await importData(tradeId, parsed, [])
        toast('Import complete!')
        setParsed(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    }, 'Checking…')
  }

  if (!editableTrades.length) {
    return <Empty>You are not an editor of any trade. Ask an admin to grant you access.</Empty>
  }

  return (
    <>
      <div className="card">
        <div className="card-head"><h2>Upload split-up Excel file</h2></div>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Upload your split-up Excel file (<b>official GOVT. ITI format</b> — sheets named{' '}
          <code>splitup p</code> and <code>splitup tt</code>). LOs, jobs/lessons, and tasks/topics
          will be imported automatically.
        </p>

        {editableTrades.length > 1 && (
          <Field label="Trade to import into">
            <select value={tradeId} onChange={(e) => { setTradeId(e.target.value); setParsed(null) }}>
              {editableTrades.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.code ? ` (${t.code})` : ''}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Select Excel file (.xlsx)">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} />
        </Field>

        {error && (
          <div style={{ background: 'var(--danger-soft, #fff0f0)', color: 'var(--danger)', borderRadius: 6, padding: '8px 12px', marginTop: 8, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {parsed && (
          <>
            <div style={{ background: 'var(--accent-soft)', borderRadius: 6, padding: '8px 12px', marginTop: 8, fontSize: 13 }}>
              ✅ File read successfully — sheets found: <b>{parsed.sheetNames.join(', ')}</b>
            </div>
            <PreviewPanel practical={parsed.practical} theory={parsed.theory} />
            <div className="row end gap" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => { setParsed(null); if (fileRef.current) fileRef.current.value = '' }}>Clear</button>
              <button className="btn primary" disabled={busy || !tradeId} onClick={handleImport}>
                Import into {editableTrades.find((t) => t.id === tradeId)?.name || 'trade'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Download blank template</h2></div>
        <p className="muted small">
          Use the official GOVT. ITI format template as a starting point for your split-up.
          Fill in your trade name in the top-right, then replace the sample rows with your actual
          syllabus content.
        </p>
        <a
          href="https://github.com/iticopadvpm-droid/iti-logbook/raw/main/public/ITI_Splitup_Template.xlsx"
          className="btn"
          download
          target="_blank"
          rel="noreferrer"
        >
          ⬇️ Download template
        </a>
      </div>

      {conflict && (
        <ConflictModal
          tradeId={tradeId}
          existing={conflict.existing}
          incoming={conflict.incoming}
          onClose={() => setConflict(null)}
          onDone={() => { setParsed(null); if (fileRef.current) fileRef.current.value = '' }}
        />
      )}
    </>
  )
}
