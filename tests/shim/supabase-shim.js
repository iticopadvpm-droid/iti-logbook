// TEST-ONLY stand-in for @supabase/supabase-js in the browser (see vite.config.js, VITE_USE_SHIM=1).
import stubSql from '../supabase-stub.sql?raw'
import schemaSql from '../../supabase/schema.sql?raw'
import { makeShim } from './core.js'

const name = (() => { try { return localStorage.getItem('shim.db') || (localStorage.setItem('shim.db', 'shim-' + Math.random().toString(36).slice(2)), localStorage.getItem('shim.db')) } catch { return 'shim-mem' } })()
const session = {
  get: () => { try { return JSON.parse(localStorage.getItem('shim.session')) } catch { return null } },
  set: (s) => (s ? localStorage.setItem('shim.session', JSON.stringify(s)) : localStorage.removeItem('shim.session')),
}
const toDataUrl = (blob) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob) })

const shim = makeShim({
  stubSql, schemaSql, dataDir: 'idb://' + name, session, toDataUrl,
  expose: (api) => { window.__shim = { ...api, reset: () => { localStorage.removeItem('shim.db'); localStorage.removeItem('shim.session') } } },
})
export const createClient = shim.createClient
