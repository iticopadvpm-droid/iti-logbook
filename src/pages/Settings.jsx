import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Tabs } from '../components/ui'
import Account from './settings/Account'
import Trades from './settings/Trades'
import Itis from './settings/Itis'
import Users from './settings/Users'
import Prefs from './settings/Prefs'
import Backup from './settings/Backup'

export default function Settings({ onTrade }) {
  const { tab = 'account' } = useParams()
  const nav = useNavigate()
  const a = useAuth()
  const tabs = [
    { id: 'account', label: 'My account' },
    a.isAdmin && { id: 'trades', label: 'Trades' },
    a.isAdmin && { id: 'itis', label: 'ITIs' },
    a.isAdmin && { id: 'users', label: 'Users & access' },
    { id: 'prefs', label: 'This computer' },
    a.trades.some((t) => a.canEditTrade(t)) && { id: 'backup', label: 'Backup' },
  ].filter(Boolean)
  const cur = tabs.some((t) => t.id === tab) ? tab : 'account'
  return (
    <>
      <h1>⚙️ Settings</h1>
      <div className="mt"><Tabs tabs={tabs} value={cur} onChange={(t) => nav(`/settings/${t}`)} /></div>
      {cur === 'account' && <Account />}
      {cur === 'trades' && <Trades onTrade={onTrade} />}
      {cur === 'itis' && <Itis />}
      {cur === 'users' && <Users />}
      {cur === 'prefs' && <Prefs onTrade={onTrade} />}
      {cur === 'backup' && <Backup />}
    </>
  )
}
