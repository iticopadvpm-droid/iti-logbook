import { useCallback, useEffect, useState } from 'react'
import { del, ins, upd } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Badge, Empty, Field, Modal, Spinner, useAction, useConfirm } from '../../components/ui'

const ROLES = { super_admin: 'Super admin', iti_admin: 'ITI admin', instructor: 'Instructor', viewer: 'Viewer (read only)' }
const HELP = {
  iti_admin: 'Manages everything in the ITI: trades, people, content.',
  instructor: 'Can add and edit syllabus, tasks, notes and diaries.',
  viewer: 'Can read everything but not change it.',
}

function Grant({ user, onClose, onDone }) {
  const a = useAuth()
  const itis = a.itis.filter((i) => a.adminItiIds.includes(i.id))
  const [f, setF] = useState({ role: 'instructor', iti_id: (itis.find((i) => i.id === user.requested_iti_id) || itis[0])?.id || '', trade_id: '' })
  const [run, busy] = useAction()
  const trades = a.trades.filter((t) => t.iti_id === f.iti_id)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'iti_id' || k === 'role' ? { trade_id: '' } : {}) })
  return (
    <Modal title={`Give access to ${user.full_name || user.email}`} onClose={onClose} small>
      <form onSubmit={(e) => { e.preventDefault(); run(async () => {
        if (f.role === 'super_admin') await ins('memberships', { user_id: user.id, role: 'super_admin' })
        else await ins('memberships', { user_id: user.id, role: f.role, iti_id: f.iti_id, trade_id: f.role === 'iti_admin' ? null : f.trade_id || null })
        onDone(); onClose()
      }, 'Access given') }}>
        <Field label="Role" hint={HELP[f.role]}>
          <select value={f.role} onChange={set('role')}>
            {['instructor', 'viewer', 'iti_admin'].map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            {a.isSuper && <option value="super_admin">{ROLES.super_admin}</option>}
          </select>
        </Field>
        {f.role !== 'super_admin' && <Field label="ITI"><select value={f.iti_id} onChange={set('iti_id')} required>{itis.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>}
        {(f.role === 'instructor' || f.role === 'viewer') && <Field label="Which trades"><select value={f.trade_id} onChange={set('trade_id')}><option value="">All trades of this ITI</option>{trades.map((t) => <option key={t.id} value={t.id}>{t.name} only</option>)}</select></Field>}
        <div className="row end gap"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Give access</button></div>
      </form>
    </Modal>
  )
}

export default function Users() {
  const a = useAuth()
  const confirm = useConfirm()
  const [data, setData] = useState(null)
  const [grant, setGrant] = useState(null)
  const [run] = useAction()

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([supabase.from('profiles').select('*').order('full_name'), supabase.from('memberships').select('*')])
    setData({ profiles: p.data || [], memberships: m.data || [] })
  }, [])
  useEffect(() => { load() }, [load])
  if (!data) return <Spinner />

  const byUser = (id) => data.memberships.filter((m) => m.user_id === id)
  const pending = data.profiles.filter((p) => p.id !== a.session.user.id && !byUser(p.id).length)
  const members = data.profiles.filter((p) => byUser(p.id).length)
  const scope = (m) => m.role === 'super_admin' ? 'all ITIs' : `${a.itiOf(m.iti_id)?.short_name || a.itiOf(m.iti_id)?.name || '?'}${m.trade_id ? ' · ' + (a.tradeOf(m.trade_id)?.name || '?') : m.role === 'iti_admin' ? '' : ' · all trades'}`
  const superCount = data.memberships.filter((m) => m.role === 'super_admin').length

  async function remove(m, p) {
    if (m.role === 'super_admin' && superCount <= 1) return run(async () => { throw new Error('You cannot remove the last super admin.') })
    if (!(await confirm({ title: 'Remove this access?', body: `${p.full_name || p.email}: ${ROLES[m.role]} · ${scope(m)}`, danger: true, confirmText: 'Remove' }))) return
    run(async () => { await del('memberships', m.id); await load(); if (p.id === a.session.user.id) await a.refresh() }, 'Removed')
  }

  return (
    <>
      <div className="card">
        <div className="card-head"><h2>Waiting for approval <Badge tone={pending.length ? 'warn' : ''}>{pending.length}</Badge></h2></div>
        {!pending.length ? <p className="muted">Nobody is waiting. New people appear here after they create an account.</p> : pending.map((p) => (
          <div key={p.id} className="row between wrap gap" style={{ padding: '8px 0', borderBottom: '1px solid var(--soft)' }}>
            <div><b>{p.full_name || '(no name)'}</b> <span className="muted small">{p.email}</span><div className="small muted">Asked for: {a.itiOf(p.requested_iti_id)?.name || 'no ITI chosen'}{p.request_note ? ` · “${p.request_note}”` : ''}</div></div>
            <button className="btn primary sm" onClick={() => setGrant(p)}>Approve…</button>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h2>People with access</h2></div>
        {!members.length ? <Empty>No one yet.</Empty> : members.map((p) => (
          <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--soft)' }}>
            <div className="row between wrap gap">
              <div><b>{p.full_name || '(no name)'}</b> <span className="muted small">{p.email}{p.designation ? ` · ${p.designation}` : ''}</span></div>
              <button className="btn sm" onClick={() => setGrant(p)}>＋ Add access</button>
            </div>
            <div className="col gap-s" style={{ marginTop: 6 }}>
              {byUser(p.id).map((m) => (
                <div key={m.id} className="row gap wrap small">
                  <select value={m.role} aria-label="Role" style={{ width: 'auto' }} disabled={m.role === 'super_admin' || (m.role === 'iti_admin' && !a.isSuper && false)}
                    onChange={(e) => run(async () => {
                      const role = e.target.value
                      await upd('memberships', m.id, { role, ...(role === 'iti_admin' ? { trade_id: null } : {}) }); await load()
                    }, 'Role changed')}>
                    {m.role === 'super_admin' ? <option value="super_admin">{ROLES.super_admin}</option> : ['iti_admin', 'instructor', 'viewer'].map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
                  </select>
                  <span className="grow muted">{scope(m)}</span>
                  {(m.role !== 'super_admin' || a.isSuper) && <button className="btn sm" onClick={() => remove(m, p)}>Remove</button>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {grant && <Grant user={grant} onClose={() => setGrant(null)} onDone={load} />}
    </>
  )
}
