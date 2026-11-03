import { useState } from 'react'
import { upd } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Badge, Field, useAction } from '../../components/ui'

const ROLE = { super_admin: 'Super admin', iti_admin: 'ITI admin', instructor: 'Instructor', viewer: 'Viewer' }

export default function Account() {
  const a = useAuth()
  const p = a.profile || {}
  const [f, setF] = useState({ full_name: p.full_name || '', designation: p.designation || '', phone: p.phone || '', default_trade_id: p.default_trade_id || '' })
  const [pw, setPw] = useState({ a: '', b: '' })
  const [run, busy] = useAction()
  const [run2, busy2] = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, alignItems: 'start' }}>
      <form className="card" onSubmit={(e) => { e.preventDefault(); run(async () => {
        await upd('profiles', a.session.user.id, { ...f, default_trade_id: f.default_trade_id || null }); await a.refresh()
      }, 'Profile saved') }}>
        <h2 className="mb">Profile</h2>
        <Field label="E-mail (used to sign in)"><input value={p.email || ''} disabled /></Field>
        <Field label="Full name"><input value={f.full_name} onChange={set('full_name')} required /></Field>
        <Field label="Designation"><input value={f.designation} onChange={set('designation')} placeholder="e.g. Instructor, COPA" /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Open this trade after sign-in" hint="Used when this computer has no remembered trade.">
          <select value={f.default_trade_id} onChange={set('default_trade_id')}>
            <option value="">— none —</option>
            {a.trades.map((t) => <option key={t.id} value={t.id}>{a.itiOf(t.iti_id)?.short_name || a.itiOf(t.iti_id)?.name} — {t.name}</option>)}
          </select>
        </Field>
        <button className="btn primary" disabled={busy}>Save profile</button>
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} />
        <b className="small muted">Your access</b>
        <div className="col gap-s" style={{ marginTop: 6 }}>
          {a.memberships.map((m) => (
            <div key={m.id}><Badge tone="blue">{ROLE[m.role]}</Badge> <span className="small">{m.iti_id ? a.itiOf(m.iti_id)?.name : 'everything'}{m.trade_id ? ` · ${a.tradeOf(m.trade_id)?.name}` : m.iti_id && m.role !== 'iti_admin' ? ' · all trades' : ''}</span></div>
          ))}
        </div>
      </form>

      <form className="card" onSubmit={(e) => { e.preventDefault(); run2(async () => {
        if (pw.a.length < 8) throw new Error('Password must be at least 8 characters.')
        if (pw.a !== pw.b) throw new Error('The two passwords do not match.')
        const { error } = await a.setPassword(pw.a)
        if (error) throw new Error(error.message)
        setPw({ a: '', b: '' })
      }, 'Password changed') }}>
        <h2 className="mb">Change password</h2>
        <Field label="New password" hint="At least 8 characters."><input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
        <Field label="Repeat new password"><input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
        <button className="btn primary" disabled={busy2 || !pw.a}>Change password</button>
        <p className="small muted" style={{ marginTop: 14 }}>Forgot it instead? Sign out and use “Forgot password?” on the sign-in page.</p>
      </form>
    </div>
  )
}
