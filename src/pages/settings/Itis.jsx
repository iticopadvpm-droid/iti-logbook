import { useState } from 'react'
import { del, ins, upd } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Empty, Field, Modal, useAction, useConfirm } from '../../components/ui'

function ItiForm({ iti, onClose }) {
  const a = useAuth()
  const [f, setF] = useState({ name: iti?.name || '', short_name: iti?.short_name || '', print_title: iti?.print_title || '', print_subtitle: iti?.print_subtitle || '' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title={iti ? 'Edit ITI' : 'Add ITI'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); run(async () => {
        const row = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]))
        if (!row.name) throw new Error('ITI name is required.')
        iti ? await upd('itis', iti.id, row) : await ins('itis', row)
        await a.refresh(); onClose()
      }, 'Saved') }}>
        <Field label="ITI name"><input autoFocus value={f.name} onChange={set('name')} placeholder="Govt. ITI Nedumangad" required /></Field>
        <Field label="Short name" hint="Shown in menus."><input value={f.short_name} onChange={set('short_name')} placeholder="ITI Nedumangad" /></Field>
        <hr style={{ border: 0, borderTop: '1px solid var(--line)' }} />
        <p className="small muted" style={{ margin: '10px 0' }}>Printed at the top of job sheets and information sheets.</p>
        <Field label="Heading line 1" hint="Leave empty to use the ITI name."><input value={f.print_title} onChange={set('print_title')} /></Field>
        <Field label="Heading line 2"><input value={f.print_subtitle} onChange={set('print_subtitle')} placeholder="Thiruvananthapuram, Kerala" /></Field>
        <div className="row end gap"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  )
}

export default function Itis() {
  const a = useAuth()
  const confirm = useConfirm()
  const [form, setForm] = useState(null)
  const [run] = useAction()
  const list = a.itis.filter((i) => a.adminItiIds.includes(i.id))
  return (
    <>
      <div className="row between wrap gap mb">
        <p className="muted" style={{ margin: 0 }}>{a.isSuper ? 'Every institute that uses this system.' : 'Your institute’s name and print heading.'}</p>
        {a.isSuper && <button className="btn primary" onClick={() => setForm({})}>＋ Add ITI</button>}
      </div>
      {!list.length ? <Empty>No ITI yet.</Empty> : list.map((i) => (
        <div className="card" key={i.id}>
          <div className="row between wrap gap">
            <div><h3>{i.name}</h3><div className="muted small">{i.short_name && `Short: ${i.short_name} · `}Prints as: {i.print_title || i.name}{i.print_subtitle ? ` / ${i.print_subtitle}` : ''} · {a.trades.filter((t) => t.iti_id === i.id).length} trade(s)</div></div>
            <div className="row gap-s">
              <button className="btn sm" onClick={() => setForm(i)}>Edit</button>
              {a.isSuper && <button className="btn sm" onClick={async () => {
                if (await confirm({ title: `Delete ${i.name}?`, body: 'All its trades and their data are deleted permanently.', danger: true, confirmText: 'Delete ITI', typeToConfirm: i.name }))
                  run(async () => { await del('itis', i.id); await a.refresh() }, 'ITI deleted')
              }}>🗑</button>}
            </div>
          </div>
        </div>
      ))}
      {form && <ItiForm iti={form.id ? form : null} onClose={() => setForm(null)} />}
    </>
  )
}
