import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

const EMPTY = { loading: true, session: null, profile: null, memberships: [], itis: [], trades: [] }

export function AuthProvider({ children }) {
  const [s, setS] = useState(EMPTY)
  const [recovery, setRecovery] = useState(false)
  const seq = useRef(0)          // only the newest load may update the state (a slow, older one is dropped)

  const load = useCallback(async (session) => {
    const mine = ++seq.current
    if (!session) { setS({ ...EMPTY, loading: false }); return }
    const uid = session.user.id
    const [p, m, i, t] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('memberships').select('*').eq('user_id', uid),
      supabase.from('itis').select('*').order('name'),
      supabase.from('trades').select('*').order('name'),
    ])
    if (mine !== seq.current) return
    setS({
      loading: false, session,
      profile: p.data, memberships: m.data || [], itis: i.data || [], trades: t.data || [],
    })
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => alive && load(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      // never call supabase from inside this callback directly (it can deadlock) → defer
      if (event === 'SIGNED_OUT') setTimeout(() => alive && load(null), 0)
      else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')
        setTimeout(() => alive && load(session), 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [load])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await load(data.session)
  }, [load])

  const value = useMemo(() => {
    const { memberships, trades, itis } = s
    const isSuper = memberships.some((m) => m.role === 'super_admin')
    const adminItiIds = isSuper ? itis.map((i) => i.id) : memberships.filter((m) => m.role === 'iti_admin').map((m) => m.iti_id)
    const canEditTrade = (tr) => !!tr && (isSuper || memberships.some((m) => m.iti_id === tr.iti_id &&
      (m.role === 'iti_admin' || (m.role === 'instructor' && (!m.trade_id || m.trade_id === tr.id)))))
    return {
      ...s, recovery, setRecovery, refresh,
      isSuper, adminItiIds, isAdmin: adminItiIds.length > 0, canEditTrade,
      pending: !!s.session && memberships.length === 0,
      itiOf: (id) => itis.find((i) => i.id === id),
      tradeOf: (id) => trades.find((t) => t.id === id),
      signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
      signUp: (email, password, meta) => supabase.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: location.origin + location.pathname } }),
      signOut: async () => { seq.current++; await supabase.auth.signOut(); seq.current++; setS({ ...EMPTY, loading: false }) },
      resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }),
      setPassword: (password) => supabase.auth.updateUser({ password }),
    }
  }, [s, recovery, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
