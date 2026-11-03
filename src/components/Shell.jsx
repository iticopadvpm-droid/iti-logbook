import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { Spinner, useLocal } from './ui'

export default function Shell({ children, tradeId, onTrade, student }) {
  const a = useAuth()
  const d = useData()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [theme, setTheme] = useLocal('iti.theme', 'light')
  const menuRef = useRef()
  const b = d.base

  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    const h = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenu(false)
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const iti = d.iti
  const name = d.trade?.name
  const grouped = a ? a.itis.map((i) => ({ iti: i, trades: a.trades.filter((t) => t.iti_id === i.id) })).filter((g) => g.trades.length) : []

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Navigation">
        <div className="brand">
          <b>📘 {student ? (iti?.short_name || iti?.name || 'Logbook') : 'ITI Logbook'}</b>
          <small>{[iti?.name, name].filter(Boolean).join(' · ') || 'No trade selected'}</small>
        </div>
        <nav className="nav">
          <NavLink to={`${b}/`} end>🏠 Home</NavLink>
          {d.los.length > 0 && <div className="nav-h">Syllabus</div>}
          {d.los.map((l) => (
            <NavLink key={l.id} to={`${b}/lo/${l.id}`} title={l.title}><span className="n">{l.number}</span><span className="t">{l.title}</span></NavLink>
          ))}
          {(d.diaries.length > 0 || d.editing) && <div className="nav-h">Student diary</div>}
          {d.diaries.map((x) => <NavLink key={x.id} to={`${b}/diary/${x.id}`}>📔 <span className="t">{x.name}</span></NavLink>)}
          {!student && <>
            <div className="nav-h">More</div>
            <NavLink to="/repo">🗂️ Shared repository</NavLink>
            <NavLink to="/settings">⚙️ Settings</NavLink>
          </>}
        </nav>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="top no-print">
          <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setOpen(true)}>☰</button>
          {student ? <b>{name}</b> : (
            <select aria-label="Trade" value={tradeId || ''} onChange={(e) => onTrade(e.target.value)} disabled={!grouped.length}>
              {!grouped.length && <option value="">No trades yet</option>}
              {grouped.map((g) => (
                <optgroup key={g.iti.id} label={g.iti.name}>
                  {g.trades.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
          )}
          <div className="grow" />
          {student && <span className="badge blue">Read-only student view</span>}
          {!student && d.canEdit && (
            <label className={`edit-pill ${d.editMode ? 'on' : ''}`}>
              <input type="checkbox" checked={d.editMode} onChange={(e) => d.setEditMode(e.target.checked)} style={{ display: 'none' }} />
              ✏️ {d.editMode ? 'Editing' : 'Edit mode'}
            </label>
          )}
          <button className="btn sm" onClick={() => window.print()} title="Print this page">🖨️ Print</button>
          {!student && (
            <div style={{ position: 'relative' }} ref={menuRef}>
              <button className="btn sm" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
                👤 {a.profile?.full_name?.split(' ')[0] || 'Account'} ▾
              </button>
              {menu && (
                <div className="pop" role="menu">
                  <div className="small muted" style={{ padding: '6px 10px' }}>{a.profile?.email}</div>
                  <Link to="/settings/account" onClick={() => setMenu(false)}>Account &amp; password</Link>
                  <Link to="/settings" onClick={() => setMenu(false)}>Settings</Link>
                  <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀️ Light theme' : '🌙 Dark theme'}</button>
                  <button onClick={a.signOut}>Sign out</button>
                </div>
              )}
            </div>
          )}
        </header>
        {d.editing && <div className="edit-banner no-print">Edit mode is on — changes are saved to the shared database straight away.</div>}
        <main className="page">
          {d.loading ? <Spinner /> : d.error ? <div className="notice err">{d.error}</div> : children}
        </main>
      </div>
    </div>
  )
}
