import { useState } from 'react'
import { del, ins, upd } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Badge, Empty, Field, Modal, useAction, useConfirm, useToast } from '../../components/ui'
import { newToken } from '../../lib/util'

const studentUrl = (t) => `${location.origin}${location.pathname}#/s/${t.share_token}`

function TradeForm({ trade, onClose, onSaved }) {
  const a = useAuth()
  const itis = a.itis.filter((i) => a.adminItiIds.includes(i.id))
  const [f, setF] = useState({ iti_id: trade?.iti_id || itis[0]?.id || '', name: trade?.name || '', code: trade?.code || '', duration_months: trade?.duration_months ?? '' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title={trade ? 'Edit trade' : 'Add trade'} onClose={onClose} small>
      <form onSubmit={(e) => { e.preventDefault(); run(async () => {
        const row = { name: f.name.trim(), code: f.code.trim(), duration_months: f.duration_months === '' ? null : Number(f.duration_months) }
        if (!row.name) throw new Error('Trade name is required.')
        const r = trade ? await upd('trades', trade.id, row) : await ins('trades', { ...row, iti_id: f.iti_id })
        await a.refresh(); onSaved?.(r); onClose()
      }, trade ? 'Saved' : 'Trade added') }}>
        {!trade && <Field label="ITI"><select value={f.iti_id} onChange={set('iti_id')} required>{itis.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>}
        <Field label="Trade name"><input autoFocus value={f.name} onChange={set('name')} placeholder="e.g. Computer Operator and Programming Assistant" required /></Field>
        <div className="form-grid">
          <Field label="Short code"><input value={f.code} onChange={set('code')} placeholder="COPA" /></Field>
          <Field label="Duration (months)"><input type="number" min="1" value={f.duration_months} onChange={set('duration_months')} /></Field>
        </div>
        <div className="row end gap"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  )
}

export default function Trades({ onTrade }) {
  const a = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [run] = useAction()
  const itis = a.itis.filter((i) => a.adminItiIds.includes(i.id))

  return (
    <>
      <div className="row between wrap gap mb">
        <p className="muted" style={{ margin: 0 }}>A trade holds its own syllabus, split-up, job tasks, lesson notes and diaries.</p>
        <button className="btn primary" onClick={() => setForm({})} disabled={!itis.length}>＋ Add trade</button>
      </div>
      {itis.map((iti) => {
        const list = a.trades.filter((t) => t.iti_id === iti.id)
        return (
          <div className="card" key={iti.id}>
            <h2 className="mb">{iti.name}</h2>
            {!list.length ? <Empty>No trades yet in this ITI.</Empty> : list.map((t) => (
              <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--soft)' }}>
                <div className="row between wrap gap">
                  <div><b>{t.name}</b> {t.code && <Badge>{t.code}</Badge>} {t.duration_months && <span className="muted small">{t.duration_months} months</span>}</div>
                  <div className="row gap-s wrap">
                    <button className="btn sm" onClick={() => { onTrade(t.id); toast('Switched to ' + t.name) }}>Open</button>
                    <button className="btn sm" onClick={() => setForm(t)}>Edit</button>
                    <button className="btn sm" onClick={async () => {
                      if (await confirm({ title: `Delete trade “${t.name}”?`, body: 'Its whole syllabus, tasks, notes, diaries and entries are deleted permanently. Anything you shared to the repository stays there.', danger: true, confirmText: 'Delete trade', typeToConfirm: t.name }))
                        run(async () => { await del('trades', t.id); await a.refresh() }, 'Trade deleted')
                    }}>🗑</button>
                  </div>
                </div>
                <div className="row gap wrap small" style={{ marginTop: 8 }}>
                  <label className="row gap-s"><input type="checkbox" checked={t.share_enabled} onChange={(e) => run(async () => { await upd('trades', t.id, { share_enabled: e.target.checked }); await a.refresh() })} /> Student read-only link</label>
                  {t.share_enabled && <>
                    <input readOnly value={studentUrl(t)} onFocus={(e) => e.target.select()} style={{ maxWidth: 420, fontSize: 12 }} aria-label="Student link" />
                    <button className="btn sm" onClick={() => navigator.clipboard?.writeText(studentUrl(t)).then(() => toast('Link copied'))}>Copy</button>
                    <button className="btn sm" onClick={async () => {
                      if (await confirm({ title: 'Make a new link?', body: 'The old link stops working. Students need the new one.', confirmText: 'New link' }))
                        run(async () => { await upd('trades', t.id, { share_token: newToken() }); await a.refresh() }, 'New link created')
                    }}>New link</button>
                  </>}
                </div>
              </div>
            ))}
          </div>
        )
      })}
      {!itis.length && <Empty>You are not an administrator of any ITI.</Empty>}
      {form && <TradeForm trade={form.id ? form : null} onClose={() => setForm(null)} onSaved={(r) => !form.id && onTrade(r.id)} />}
    </>
  )
}
