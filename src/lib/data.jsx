import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { loadBundle, loadPublicBundle } from './api'
import { useAuth } from './auth'
import { bySort, natCmp } from './util'

const Ctx = createContext(null)
export const useData = () => useContext(Ctx)

const EMPTY = { trade: null, iti: null, los: [], items: [], tasks: [], media: [], diaries: [], entries: [] }

function indexes(b) {
  const los = [...b.los].sort(bySort)
  const items = [...b.items].sort(bySort)
  const itemsByLo = {}, tasksByItem = {}, mediaByItem = {}, mediaByTask = {}, entriesByDiary = {}
  items.forEach((i) => (itemsByLo[i.lo_id] ||= []).push(i))
  ;[...b.tasks].sort(bySort).forEach((t) => (tasksByItem[t.item_id] ||= []).push(t))
  b.media.forEach((m) => { if (m.item_id) (mediaByItem[m.item_id] ||= []).push(m); else (mediaByTask[m.task_id] ||= []).push(m) })
  b.entries.forEach((e) => (entriesByDiary[e.diary_id] ||= []).push(e))
  return {
    los, items,
    loById: Object.fromEntries(los.map((l) => [l.id, l])),
    itemById: Object.fromEntries(items.map((i) => [i.id, i])),
    taskById: Object.fromEntries(b.tasks.map((t) => [t.id, t])),
    itemsByLo, tasksByItem, mediaByItem, mediaByTask, entriesByDiary,
    diaries: [...b.diaries].sort((a, b) => (a.sort_order - b.sort_order) || natCmp(a.name, b.name)),
    practical: items.filter((i) => i.kind === 'practical'),
    theory: items.filter((i) => i.kind === 'theory'),
  }
}

// Provides the whole trade (syllabus, tasks, media, diaries) to every page.
//   private: <DataProvider tradeId=…>     public student link: <DataProvider token=…>
export function DataProvider({ tradeId, token, children }) {
  const { canEditTrade, trades } = useAuth() || {}
  const [bundle, setBundle] = useState(EMPTY)
  const [state, setState] = useState({ loading: true, error: '' })
  const [editMode, setEditMode] = useState(false)

  const reload = useCallback(async (silent = true) => {
    if (!token && !tradeId) { setBundle(EMPTY); setState({ loading: false, error: '' }); return }
    if (!silent) setState({ loading: true, error: '' })
    try {
      const b = token ? await loadPublicBundle(token) : await loadBundle(tradeId)
      if (!b) throw new Error('This link is not active.')
      setBundle({ ...EMPTY, ...b })
      setState({ loading: false, error: '' })
    } catch (e) { setState({ loading: false, error: e.message }) }
  }, [tradeId, token])

  useEffect(() => { setBundle(EMPTY); setEditMode(false); reload(false) }, [reload])

  const tradeRow = token ? bundle.trade : trades?.find((t) => t.id === tradeId)
  const canEdit = !token && !!canEditTrade?.(tradeRow)
  const idx = useMemo(() => indexes(bundle), [bundle])

  const value = useMemo(() => ({
    ...bundle, ...idx, tradeId: bundle.trade?.id || tradeId, tradeRow,
    loading: state.loading, error: state.error, reload,
    readOnly: !!token, base: token ? `/s/${token}` : '',
    canEdit, editMode, setEditMode, editing: canEdit && editMode,
  }), [bundle, idx, state, reload, token, tradeId, tradeRow, canEdit, editMode])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
