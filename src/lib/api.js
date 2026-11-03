// Thin wrappers over Supabase so pages stay short. Every function throws a readable Error.
import { supabase } from './supabase'
import { removeFromStorage } from './media'

const must = ({ data, error }) => { if (error) throw new Error(friendly(error.message)); return data }
function friendly(m) {
  if (/duplicate key/i.test(m)) return 'That number or name already exists here.'
  if (/row-level security|permission denied|not allowed/i.test(m)) return 'You do not have permission to do that.'
  if (/foreign key/i.test(m)) return 'This item is still in use.'
  return m
}

export const ins = async (table, row) => must(await supabase.from(table).insert(row).select().single())
export const insMany = async (table, rows) => (rows.length ? must(await supabase.from(table).insert(rows).select()) : [])
export const upd = async (table, id, patch) => must(await supabase.from(table).update(patch).eq('id', id).select().single())
export const del = async (table, id) => must(await supabase.from(table).delete().eq('id', id))
export const rpc = async (fn, args) => must(await supabase.rpc(fn, args))

export async function deleteMedia(id) {
  const path = await rpc('delete_media', { p_id: id })     // returns a path only if nothing else uses the file
  if (path) await removeFromStorage(path)
}

export const loadBundle = (tradeId) => rpc('get_trade_bundle', { p_trade_id: tradeId })
export const loadPublicBundle = (token) => rpc('public_bundle', { p_token: token })

