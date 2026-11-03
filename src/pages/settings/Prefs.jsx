import { useAuth } from '../../lib/auth'
import { Field, useLocal } from '../../components/ui'

export default function Prefs({ onTrade }) {
  const a = useAuth()
  const [theme, setTheme] = useLocal('iti.theme', 'light')
  const [saved] = useLocal('iti.trade', null)
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h2 className="mb">This computer</h2>
      <p className="muted small">These choices are remembered only in this browser, so each staff-room computer can open its own trade by default.</p>
      <Field label="Trade opened on this computer">
        <select value={saved || ''} onChange={(e) => onTrade(e.target.value)}>
          {a.trades.map((t) => <option key={t.id} value={t.id}>{a.itiOf(t.iti_id)?.short_name || a.itiOf(t.iti_id)?.name} — {t.name}</option>)}
        </select>
      </Field>
      <Field label="Appearance">
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="light">Light</option><option value="dark">Dark</option><option value="auto">Same as my device</option>
        </select>
      </Field>
    </div>
  )
}
