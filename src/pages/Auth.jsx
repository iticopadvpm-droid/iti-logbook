import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Field, useAction } from '../components/ui'

const Logo = () => <div className="logo" aria-hidden>📘</div>

export function SetupNeeded() {
  return (
    <div className="auth"><div className="card">
      <Logo /><h1>Almost there</h1>
      <p className="muted">This copy of the app is not connected to a database yet.</p>
      <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (GitHub → Settings → Secrets and variables → Actions → <b>Variables</b>), then re-run the deploy. The README has the step-by-step.</p>
    </div></div>
  )
}

export function AuthPage() {
  const a = useAuth()
  const [mode, setMode] = useState('in')       // in | up | forgot
  const [itis, setItis] = useState([])
  const [f, setF] = useState({ email: '', password: '', password2: '', name: '', iti: '', note: '' })
  const [msg, setMsg] = useState('')
  const [run, busy] = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => { supabase.from('itis').select('id,name').order('name').then(({ data }) => setItis(data || [])) }, [])

  const submit = (e) => {
    e.preventDefault(); setMsg('')
    run(async () => {
      if (mode === 'in') {
        const { error } = await a.signIn(f.email.trim(), f.password)
        if (error) throw new Error(/invalid/i.test(error.message) ? 'Wrong e-mail or password.' : error.message)
      } else if (mode === 'up') {
        if (f.password.length < 8) throw new Error('Password must be at least 8 characters.')
        if (f.password !== f.password2) throw new Error('The two passwords do not match.')
        if (!f.name.trim()) throw new Error('Please enter your name.')
        const { data, error } = await a.signUp(f.email.trim(), f.password, { full_name: f.name.trim(), requested_iti: f.iti || null, note: f.note.trim() })
        if (error) throw new Error(error.message)
        if (!data.session) setMsg('Account created. Check your e-mail and click the confirmation link, then sign in. Your ITI administrator must also approve you.')
      } else {
        const { error } = await a.resetPassword(f.email.trim())
        if (error) throw new Error(error.message)
        setMsg('If that e-mail has an account, a reset link is on its way.')
      }
    })
  }

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <Logo />
        <h1>{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Reset password'}</h1>
        <p className="muted" style={{ marginBottom: 16 }}>ITI Digital Logbook — syllabus, job sheets, theory notes and student diary.</p>
        {msg && <div className="notice">{msg}</div>}
        {mode === 'up' && <>
          <Field label="Full name"><input value={f.name} onChange={set('name')} autoComplete="name" required /></Field>
          <Field label="Your ITI (optional)" hint="Type your ITI name. Leave blank if you are the system administrator.">
            <input value={f.iti} onChange={set('iti')} placeholder="e.g. Govt. ITI Dhanuvachapuram" autoComplete="organization" />
          </Field>
        </>}
        <Field label="E-mail"><input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
        {mode !== 'forgot' && <Field label="Password"><input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required /></Field>}
        {mode === 'up' && <>
          <Field label="Repeat password"><input type="password" value={f.password2} onChange={set('password2')} autoComplete="new-password" required /></Field>
          <Field label="Note to the administrator (optional)"><input value={f.note} onChange={set('note')} placeholder="e.g. COPA instructor" maxLength={300} /></Field>
        </>}
        <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</button>
        <div className="row between small" style={{ marginTop: 14 }}>
          {mode === 'in' ? <>
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('up'); setMsg('') }}>Create an account</a>
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); setMsg('') }}>Forgot password?</a>
          </> : <a href="#" onClick={(e) => { e.preventDefault(); setMode('in'); setMsg('') }}>← Back to sign in</a>}
        </div>
      </form>
    </div>
  )
}

export function NewPassword() {
  const a = useAuth()
  const [p, setP] = useState(''), [p2, setP2] = useState('')
  const [run, busy] = useAction()
  const go = (e) => {
    e.preventDefault()
    run(async () => {
      if (p.length < 8) throw new Error('Password must be at least 8 characters.')
      if (p !== p2) throw new Error('The two passwords do not match.')
      const { error } = await a.setPassword(p)
      if (error) throw new Error(error.message)
      a.setRecovery(false)
    }, 'Password changed')
  }
  return (
    <div className="auth"><form className="card" onSubmit={go}>
      <Logo /><h1>Choose a new password</h1>
      <Field label="New password"><input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="new-password" required /></Field>
      <Field label="Repeat"><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" required /></Field>
      <button className="btn primary" disabled={busy}>Save password</button>
    </form></div>
  )
}

export function Pending() {
  const a = useAuth()
  const iti = a.itiOf(a.profile?.requested_iti_id)
  return (
    <div className="auth"><div className="card">
      <Logo /><h1>Waiting for approval</h1>
      <p>Hello <b>{a.profile?.full_name || a.session.user.email}</b>, your account is created.</p>
      <p className="muted">An administrator{iti ? <> of <b>{iti.name}</b></> : ''} needs to give you access. Ask them to open <b>Settings → Users &amp; access</b>.</p>
      <div className="row gap" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={a.refresh}>Check again</button>
        <button className="btn" onClick={a.signOut}>Sign out</button>
      </div>
    </div></div>
  )
}
