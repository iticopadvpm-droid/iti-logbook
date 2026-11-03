import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { DataProvider, useData } from './lib/data'
import { configured } from './lib/supabase'
import { Spinner, useLocal } from './components/ui'
import Shell from './components/Shell'
import { AuthPage, NewPassword, Pending, SetupNeeded } from './pages/Auth'
import Home from './pages/Home'
import LoPage from './pages/LoPage'
import ItemPage from './pages/ItemPage'
import { SheetItem, SheetLo } from './pages/Sheets'
import Diary from './pages/Diary'
import Repository from './pages/Repository'
import Settings from './pages/Settings'

// Pages that exist both for signed-in users and for the read-only student link
function ContentRoutes({ extra }) {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lo/:loId" element={<LoPage />} />
      <Route path="/item/:itemId" element={<ItemPage />} />
      <Route path="/sheet/lo/:loId/:kind" element={<SheetLo />} />
      <Route path="/sheet/item/:itemId" element={<SheetItem />} />
      <Route path="/diary" element={<Diary />} />
      <Route path="/diary/:diaryId" element={<Diary />} />
      <Route path="/diary/:diaryId/all" element={<Diary printAll />} />
      {extra}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function StudentApp() {
  const { token } = useParams()
  return (
    <DataProvider token={token}>
      <StudentGate />
    </DataProvider>
  )
}
function StudentGate() {
  const d = useData()
  if (d.loading) return <Spinner />
  if (d.error) return <div className="auth"><div className="card"><h2>Link not available</h2><p className="muted">{d.error} Ask your instructor for the current link.</p></div></div>
  return <Shell student><ContentRoutes /></Shell>
}

function PrivateApp() {
  const a = useAuth()
  const [saved, setSaved] = useLocal('iti.trade', null)
  const [tradeId, setTradeId] = useState(null)

  useEffect(() => {
    if (!a.session) return
    const ids = a.trades.map((t) => t.id)
    const pick = [tradeId, saved, a.profile?.default_trade_id, ids[0]].find((x) => x && ids.includes(x)) || null
    if (pick !== tradeId) setTradeId(pick)
  }, [a.session, a.trades, a.profile, saved, tradeId])

  if (a.loading) return <Spinner />
  if (a.recovery) return <NewPassword />
  if (!a.session) return <AuthPage />
  if (a.pending) return <Pending />

  const choose = (id) => { setTradeId(id); setSaved(id) }
  return (
    <DataProvider tradeId={tradeId} key={tradeId || 'none'}>
      <Shell tradeId={tradeId} onTrade={choose}>
        <ContentRoutes extra={[
          <Route key="repo" path="/repo" element={<Repository onUse={choose} />} />,
          <Route key="set" path="/settings" element={<Settings onTrade={choose} />} />,
          <Route key="set2" path="/settings/:tab" element={<Settings onTrade={choose} />} />,
        ]} />
      </Shell>
    </DataProvider>
  )
}

export default function App() {
  if (!configured) return <SetupNeeded />
  return (
    <Routes>
      <Route path="/s/:token/*" element={<StudentApp />} />
      <Route path="*" element={<PrivateApp />} />
    </Routes>
  )
}
