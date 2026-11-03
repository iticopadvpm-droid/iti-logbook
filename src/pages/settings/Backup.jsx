import { useData } from '../../lib/data'
import { download, slug } from '../../lib/util'
import { ymd } from '../../lib/dates'

const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')

export default function Backup() {
  const d = useData()
  if (!d.trade) return <p className="muted">Pick a trade first.</p>
  const stamp = `${slug(d.trade.name)}-${ymd(new Date())}`
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h2 className="mb">Backup — {d.trade.name}</h2>
      <p className="muted small">Your data lives in the Supabase database (it has its own daily backups on paid plans). These downloads are an extra copy you keep yourself.</p>
      <div className="col gap">
        <div className="row between gap wrap">
          <div><b>Everything (JSON)</b><div className="small muted">Syllabus, split-up, tasks, notes, diaries. Pictures are kept as links.</div></div>
          <button className="btn primary" onClick={() => download(`${stamp}.json`, JSON.stringify({ exported: new Date().toISOString(), iti: d.iti, trade: d.trade, los: d.los, items: d.items, tasks: d.tasks, media: d.media, diaries: d.diaries, entries: d.entries }, null, 1))}>Download</button>
        </div>
        <div className="row between gap wrap">
          <div><b>Syllabus list (CSV)</b><div className="small muted">LO, kind, number, title, hours — opens in Excel.</div></div>
          <button className="btn" onClick={() => download(`${stamp}-syllabus.csv`, '﻿' + csv([['LO', 'Kind', 'No.', 'Title', 'Hours'], ...d.items.map((i) => [d.loById[i.lo_id]?.number, i.kind, i.number, i.title, i.hours])]), 'text/csv')}>Download</button>
        </div>
        <div className="row between gap wrap">
          <div><b>Diary entries (CSV)</b><div className="small muted">All diaries, one row per day.</div></div>
          <button className="btn" onClick={() => download(`${stamp}-diary.csv`, '﻿' + csv([['Diary', 'Week of', 'Day', 'Date', 'Ex. no', 'Practical', 'Lesson no', 'Theory'], ...d.entries.map((e) => [d.diaries.find((x) => x.id === e.diary_id)?.name, e.week_start, e.day_idx + 1, e.entry_date, e.practical_no, e.practical_title, e.theory_no, e.theory_title])]), 'text/csv')}>Download</button>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>Tip: sharing your trade to the repository (visible to “my ITI only”) also keeps a restorable copy of the syllabus and notes.</p>
    </div>
  )
}
