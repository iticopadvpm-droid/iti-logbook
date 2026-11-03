// Shared engine of the test stand-in for @supabase/supabase-js: real SQL (PGlite) + the real schema.sql.
// Used by the browser wrapper (supabase-shim.js, for UI tests) and by Node (tests/migrate.test.mjs).
import { PGlite } from '@electric-sql/pglite'

const PARSERS = { 1082: (v) => v, 1114: (v) => v, 1184: (v) => v, 1700: (v) => Number(v) }

export function makeShim({ stubSql, schemaSql, dataDir, session, toDataUrl, expose, publicUrlFor }) {
  let ready
  const files = new Map()          // path → data URL (public bucket stand-in)
  function boot() {
    if (ready) return ready
    ready = (async () => {
      const db = new PGlite(dataDir)
      await db.waitReady
      const has = await db.query(`select to_regclass('public.trades') t`)
      if (!has.rows[0].t) {
        await db.exec(stubSql)
        await db.exec(schemaSql)
        await db.exec(`create table if not exists public.shim_pw(id uuid primary key, email text unique, password text);
                       create table if not exists public.shim_files(path text primary key, data text);
                       grant all on public.shim_pw, public.shim_files to public`)
      }
      for (const r of (await db.query('select path,data from public.shim_files')).rows) files.set(r.path, r.data)
      expose?.({ db, exec: (sql, p) => db.query(sql, p, { parsers: PARSERS }), files })
      return db
    })()
    return ready
  }
  const exec = async (sql, p) => (await boot()).query(sql, p, { parsers: PARSERS })

  // ── session ─────────────────────────────────────────────────────────────
  const listeners = new Set()
  const getSess = () => session.get()
  const setSess = (s) => session.set(s)
  const emit = (ev, s) => listeners.forEach((cb) => setTimeout(() => cb(ev, s), 0))

  // run fn inside a transaction as the current role
  async function asRole(fn) {
    const db = await boot()
    const s = getSess()
    return db.transaction(async (tx) => {
      await tx.query(`set local role ${s ? 'authenticated' : 'anon'}`)
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [s ? s.user.id : ''])
      return fn(tx)
    })
  }

  const q = (id) => '"' + String(id).replace(/"/g, '""') + '"'
  const pgArray = (a) => '{' + a.map((x) => (x === null ? 'NULL' : '"' + String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"')).join(',') + '}'
  const val = (v) => (Array.isArray(v) ? pgArray(v) : v && typeof v === 'object' ? JSON.stringify(v) : v)
  const err = (e) => ({ data: null, error: { message: String(e.message || e), code: e.code } })

  class Builder {
    constructor(table) { this.t = table; this.op = 'select'; this.cols = '*'; this.wh = []; this.ord = []; this.ret = false; this.one = null; this.lim = null }
    select(cols = '*') { if (this.op === 'select') this.cols = cols; else this.ret = cols; return this }
    insert(rows) { this.op = 'insert'; this.rows = Array.isArray(rows) ? rows : [rows]; return this }
    upsert(rows, o = {}) { this.op = 'upsert'; this.rows = Array.isArray(rows) ? rows : [rows]; this.conflict = o.onConflict; return this }
    update(p) { this.op = 'update'; this.patch = p; return this }
    delete() { this.op = 'delete'; return this }
    eq(c, v) { this.wh.push([c, v === null ? 'is' : '=', v]); return this }
    neq(c, v) { this.wh.push([c, '<>', v]); return this }
    in(c, v) { this.wh.push([c, 'in', v]); return this }
    is(c, v) { this.wh.push([c, 'is', v]); return this }
    order(c, o = {}) { this.ord.push(`${q(c)} ${o.ascending === false ? 'desc' : 'asc'}`); return this }
    limit(n) { this.lim = n; return this }
    single() { this.one = 'single'; return this }
    maybeSingle() { this.one = 'maybe'; return this }
    then(res, rej) { return this.run().then(res, rej) }

    async run() {
      try {
        const params = []
        const P = (v) => { params.push(val(v)); return '$' + params.length }
        const where = this.wh.length ? ' where ' + this.wh.map(([c, op, v]) =>
          op === 'is' ? `${q(c)} is ${v === null ? 'null' : v ? 'true' : 'false'}`
            : op === 'in' ? `${q(c)}::text = any(${P(v)}::text[])` : `${q(c)}::text ${op} ${P(v)}::text`).join(' and ') : ''
        const retCols = (c) => (c === '*' ? '*' : c.split(',').map((x) => q(x.trim())).join(','))
        let sql
        const T = 'public.' + q(this.t)
        if (this.op === 'select') {
          sql = `select ${retCols(this.cols)} from ${T}${where}${this.ord.length ? ' order by ' + this.ord.join(',') : ''}${this.lim ? ' limit ' + this.lim : ''}`
        } else if (this.op === 'insert' || this.op === 'upsert') {
          const keys = [...new Set(this.rows.flatMap((r) => Object.keys(r)))]
          const vals = this.rows.map((r) => '(' + keys.map((k) => (r[k] === undefined ? 'default' : P(r[k]))).join(',') + ')').join(',')
          sql = `insert into ${T} (${keys.map(q).join(',')}) values ${vals}`
          if (this.op === 'upsert') {
            const cf = (this.conflict || 'id').split(',').map((x) => q(x.trim())).join(',')
            sql += ` on conflict (${cf}) do update set ${keys.map((k) => `${q(k)}=excluded.${q(k)}`).join(',')}`
          }
          if (this.ret) sql += ` returning ${retCols(this.ret)}`
        } else if (this.op === 'update') {
          const ks = Object.keys(this.patch)
          sql = `update ${T} set ${ks.map((k) => `${q(k)}=${P(this.patch[k])}`).join(',')}${where}${this.ret ? ` returning ${retCols(this.ret)}` : ''}`
        } else {
          sql = `delete from ${T}${where}${this.ret ? ` returning ${retCols(this.ret)}` : ''}`
        }
        const r = await asRole((tx) => tx.query(sql, params, { parsers: PARSERS }))
        const writes = this.op !== 'select'
        if (writes && !this.ret) return { data: null, error: null }
        if (this.one) {
          if (r.rows.length > 1 || (this.one === 'single' && r.rows.length === 0)) return { data: null, error: { message: this.one === 'single' && !r.rows.length ? 'JSON object requested, multiple (or no) rows returned' : 'multiple rows' } }
          return { data: r.rows[0] ?? null, error: null }
        }
        return { data: r.rows, error: null }
      } catch (e) { return err(e) }
    }
  }

  const auth = {
    async getSession() { await boot(); return { data: { session: getSess() }, error: null } },
    onAuthStateChange(cb) {
      listeners.add(cb)
      boot().then(() => setTimeout(() => cb('INITIAL_SESSION', getSess()), 0))
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
    },
    async signInWithPassword({ email, password }) {
      const db = await boot()
      const r = await db.query('select id,email,password from public.shim_pw where lower(email)=lower($1)', [email])
      if (!r.rows.length || r.rows[0].password !== password) return { data: { session: null }, error: { message: 'Invalid login credentials' } }
      const s = { user: { id: r.rows[0].id, email: r.rows[0].email } }
      setSess(s); emit('SIGNED_IN', s)
      return { data: { session: s, user: s.user }, error: null }
    },
    async signUp({ email, password, options = {} }) {
      const db = await boot()
      try {
        const r = await db.query('insert into auth.users(email, raw_user_meta_data) values ($1,$2) returning id', [email, JSON.stringify(options.data || {})])
        await db.query('insert into public.shim_pw(id,email,password) values ($1,$2,$3)', [r.rows[0].id, email, password])
        const s = { user: { id: r.rows[0].id, email } }
        setSess(s); emit('SIGNED_IN', s)
        return { data: { session: s, user: s.user }, error: null }
      } catch (e) { return { data: { session: null }, error: { message: /duplicate/.test(e.message) ? 'User already registered' : e.message } } }
    },
    async signOut() { setSess(null); emit('SIGNED_OUT', null); return { error: null } },
    async updateUser({ password }) {
      const db = await boot(); const s = getSess()
      if (password) await db.query('update public.shim_pw set password=$1 where id=$2', [password, s.user.id])
      emit('USER_UPDATED', s); return { data: { user: s.user }, error: null }
    },
    async resetPasswordForEmail() { return { data: {}, error: null } },
  }

  const storage = {
    from: () => ({
      async upload(path, blob) {
        try {
          const data = await toDataUrl(blob)
          await asRole((tx) => tx.query(`insert into storage.objects(bucket_id,name) values ('media',$1)`, [path]))
          const db = await boot(); await db.query('insert into public.shim_files(path,data) values ($1,$2) on conflict (path) do update set data=excluded.data', [path, data])
          files.set(path, data); return { data: { path }, error: null }
        } catch (e) { return err(e) }
      },
      getPublicUrl: (path) => ({ data: { publicUrl: publicUrlFor ? publicUrlFor(path) : files.get(path) || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' } }),
      async remove(paths) {
        try { await asRole((tx) => tx.query(`delete from storage.objects where bucket_id='media' and name = any($1::text[])`, [pgArray(paths)])); paths.forEach((p) => files.delete(p)); return { data: [], error: null } } catch (e) { return err(e) }
      },
    }),
  }

  async function rpc(fn, args = {}) {
    try {
      const keys = Object.keys(args)
      const sql = `select public.${q(fn)}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`
      const r = await asRole((tx) => tx.query(sql, keys.map((k) => val(args[k])), { parsers: PARSERS }))
      return { data: r.rows[0]?.r ?? null, error: null }
    } catch (e) { return err(e) }
  }

  return { createClient: () => { boot(); return { auth, storage, from: (t) => new Builder(t), rpc } }, exec, boot }
}
