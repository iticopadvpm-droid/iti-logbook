import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// ── Toasts ────────────────────────────────────────────────────────────
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

// ── Confirm dialogs (await confirm({...}) → true/false) ───────────────
const ConfirmCtx = createContext(async () => false)
export const useConfirm = () => useContext(ConfirmCtx)

export function UiProviders({ children }) {
  const [toasts, setToasts] = useState([])
  const [ask, setAsk] = useState(null)
  const toast = useCallback((msg, kind = 'ok') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 6000 : 2600)
  }, [])
  const confirm = useCallback((opts) => new Promise((resolve) => setAsk({ ...opts, resolve })), [])
  const close = (v) => { ask.resolve(v); setAsk(null) }
  const [typed, setTyped] = useState('')
  useEffect(() => setTyped(''), [ask])

  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
        </div>
        {ask && (
          <Modal title={ask.title || 'Are you sure?'} onClose={() => close(false)} small>
            {ask.body && <p className="muted" style={{ marginBottom: 12 }}>{ask.body}</p>}
            {ask.typeToConfirm && (
              <label className="field">
                <span>Type <b>{ask.typeToConfirm}</b> to confirm</span>
                <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
              </label>
            )}
            <div className="row end gap">
              <button className="btn" onClick={() => close(false)}>Cancel</button>
              <button className={`btn ${ask.danger ? 'danger' : 'primary'}`}
                disabled={ask.typeToConfirm && typed.trim() !== ask.typeToConfirm}
                onClick={() => close(true)}>{ask.confirmText || 'OK'}</button>
            </div>
          </Modal>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, small, wide }) {
  const ref = useRef()
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`modal ${small ? 'small' : ''} ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────
export const Spinner = ({ label = 'Loading…' }) => <div className="center muted pad"><span className="spin" /> {label}</div>
export const Empty = ({ children }) => <div className="empty">{children}</div>
export const Badge = ({ children, tone = '' }) => <span className={`badge ${tone}`}>{children}</span>

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}{t.count != null && <em>{t.count}</em>}
        </button>
      ))}
    </div>
  )
}

// busy-state + error toast around any async action
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true)
    try { const r = await fn(); if (okMsg) toast(okMsg); return r }
    catch (e) { toast(e.message || String(e), 'err'); return undefined }
    finally { setBusy(false) }
  }, [toast])
  return [run, busy]
}

// local preference helpers (per computer). Several components can share one key.
export function useLocal(key, initial) {
  const read = () => { try { const r = localStorage.getItem(key); return r == null ? initial : JSON.parse(r) } catch { return initial } }
  const [v, setV] = useState(read)
  useEffect(() => {
    const h = (e) => { if (!e.detail || e.detail === key) setV(read()) }
    window.addEventListener('local-pref', h); return () => window.removeEventListener('local-pref', h)
  }, [key])  // eslint-disable-line
  const set = useCallback((x) => {
    setV(x)
    try { localStorage.setItem(key, JSON.stringify(x)) } catch {}
    window.dispatchEvent(new CustomEvent('local-pref', { detail: key }))
  }, [key])
  return [v, set]
}
