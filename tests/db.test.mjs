// Runs supabase/schema.sql on a real Postgres (PGlite) and checks the access rules.
//   npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const db = new PGlite()
let pass = 0, fail = 0

async function as(user, fn) {            // user: uuid | null (anon) | 'root'
  if (user === 'root') { await db.exec('reset role; select set_config(\'request.jwt.claim.sub\', \'\', false)'); return fn() }
  await db.exec(`select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'}`)
  try { return await fn() } finally { await db.exec('reset role') }
}
const q = async (sql, params) => (await db.query(sql, params)).rows
async function ok(name, cond) { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗ FAIL:', name) } }
async function throws(name, fn) {
  try { await fn(); fail++; console.log('  ✗ FAIL (no error):', name) }
  catch (e) { pass++; console.log('  ✓', name, '→', String(e.message).slice(0, 60)) }
}

// ---- load stub + schema (twice, to prove it can be re-run) -----------
await db.exec(readFileSync(join(here, 'supabase-stub.sql'), 'utf8'))
const schema = readFileSync(join(here, '..', 'supabase', 'schema.sql'), 'utf8')
await db.exec(schema)
await db.exec(schema)
console.log('schema loaded twice OK')

// ---- people ----------------------------------------------------------
const U = {}
const itiA = (await q(`insert into itis(name, short_name) values ('ITI A','A') returning id`))[0].id
const itiB = (await q(`insert into itis(name, short_name) values ('ITI B','B') returning id`))[0].id
for (const n of ['root', 'adminA', 'instrA', 'instrA2', 'viewerA', 'adminB', 'instrB', 'newbie'])
  U[n] = (await q(`insert into auth.users(email, raw_user_meta_data) values ($1, $2) returning id`,
    [n + '@x.in', JSON.stringify({ full_name: n, requested_iti: n === 'newbie' ? itiA : 'not-a-uuid' })]))[0].id
ok('profile auto-created for each sign-up', (await q('select count(*)::int c from profiles'))[0].c === 8)
ok('requested ITI stored; junk value ignored', (await q('select requested_iti_id r from profiles where id=$1', [U.newbie]))[0].r === itiA
  && (await q('select requested_iti_id r from profiles where id=$1', [U.adminA]))[0].r === null)
const tradeA1 = (await q(`insert into trades(iti_id, name) values ($1,'COPA') returning id`, [itiA]))[0].id
const tradeA2 = (await q(`insert into trades(iti_id, name) values ($1,'Electrician') returning id`, [itiA]))[0].id
const tradeB1 = (await q(`insert into trades(iti_id, name) values ($1,'COPA') returning id`, [itiB]))[0].id
const mem = (u, role, iti, trade) => q(`insert into memberships(user_id, role, iti_id, trade_id) values ($1,$2,$3,$4)`, [u, role, iti, trade])
await mem(U.root, 'super_admin', null, null)
await mem(U.adminA, 'iti_admin', itiA, null)
await mem(U.instrA, 'instructor', itiA, tradeA1)         // only COPA of ITI A
await mem(U.instrA2, 'instructor', itiA, null)           // every trade of ITI A
await mem(U.viewerA, 'viewer', itiA, null)
await mem(U.adminB, 'iti_admin', itiB, null)
await mem(U.instrB, 'instructor', itiB, null)

console.log('\nMembership rules')
await throws('membership with a trade from another ITI is rejected', () => mem(U.instrB, 'viewer', itiB, tradeA1))
await throws('duplicate membership rejected', () => mem(U.adminA, 'iti_admin', itiA, null))

console.log('\nVisibility of ITIs / trades')
await as(U.newbie, async () => {
  ok('pending user sees the ITI list', (await q('select * from itis')).length === 2)
  ok('pending user sees no trades', (await q('select * from trades')).length === 0)
})
await as(U.instrA, async () => ok('trade-scoped instructor sees only their trade', (await q('select id from trades')).map(r => r.id).join() === tradeA1))
await as(U.instrA2, async () => ok('ITI-wide instructor sees both ITI-A trades, not ITI B', (await q('select id from trades')).length === 2))
await as(U.adminB, async () => ok('ITI B admin sees only ITI B trade', (await q('select id from trades')).map(r => r.id).join() === tradeB1))
await as(U.root, async () => ok('super admin sees all', (await q('select id from trades')).length === 3))
await as(null, async () => {
  await throws('anon cannot read trades', () => q('select * from trades'))
  await throws('anon cannot read profiles', () => q('select * from profiles'))
  ok('anon can read ITI names (sign-up page)', (await q('select name from itis')).length === 2)
})

console.log('\nWriting content')
let lo1, item1, theory1, task1
await as(U.instrA, async () => {
  lo1 = (await q(`insert into learning_outcomes(trade_id, number, title, sort_order) values ($1,'1','Safety',1) returning id`, [tradeA1]))[0].id
  await q(`insert into learning_outcomes(trade_id, number, title, sort_order) values ($1,'2','Basics',2)`, [tradeA1])
  item1 = (await q(`insert into splitup_items(lo_id, kind, number, title, hours) values ($1,'practical','1.1','Hand tools',8) returning id`, [lo1]))[0].id
  await q(`insert into splitup_items(lo_id, kind, number, title) values ($1,'practical','1.10','Measuring')`, [lo1])
  theory1 = (await q(`insert into splitup_items(lo_id, kind, number, title, content) values ($1,'theory','1.1','Fire safety','<p>v1</p>') returning id`, [lo1]))[0].id
  task1 = (await q(`insert into tasks(item_id, number, name, procedure) values ($1,'1.1.1','Filing','step 1') returning id`, [item1]))[0].id
  await q(`insert into media(task_id, path, file_name) values ($1, $2, 'a.jpg')`, [task1, `${tradeA1}/p1.jpg`])
  await q(`insert into diaries(trade_id, name, class_start_date) values ($1,'COPA A Batch','2026-07-01')`, [tradeA1])
})
ok('trade_id is derived from the parent on children', (await q('select trade_id from tasks where id=$1', [task1]))[0].trade_id === tradeA1)
ok('1.1 and 1.10 are separate rows (text numbers)', (await q(`select count(*)::int c from splitup_items where kind='practical'`))[0].c === 2)
ok('practical 1.1 and theory 1.1 can coexist', (await q(`select count(*)::int c from splitup_items where number='1.1'`))[0].c === 2)
await as(U.instrA, async () => {
  await throws('duplicate practical number in same LO rejected', () => q(`insert into splitup_items(lo_id, kind, number, title) values ($1,'practical','1.1','dup')`, [lo1]))
  await throws('instructor cannot add LO in a different ITI trade', () => q(`insert into learning_outcomes(trade_id, number, title) values ($1,'9','x')`, [tradeB1]))
  await throws('trade-scoped instructor cannot write to the other trade', () => q(`insert into learning_outcomes(trade_id, number, title) values ($1,'9','x')`, [tradeA2]))
  await throws('instructor cannot create a trade', () => q(`insert into trades(iti_id, name) values ($1,'Fitter')`, [itiA]))
  await throws('instructor cannot grant themselves admin', () => mem(U.instrA, 'iti_admin', itiA, null))
  await throws('forged trade_id cannot move an item to another trade', () => q(`update splitup_items set trade_id=$1 where id=$2`, [tradeB1, item1]))
})
await as(U.viewerA, async () => {
  ok('viewer can read content', (await q('select id from learning_outcomes')).length === 2)
  const r = await q(`update learning_outcomes set title='hack' where id=$1 returning id`, [lo1])
  ok('viewer cannot update (0 rows)', r.length === 0)
  await throws('viewer cannot insert', () => q(`insert into learning_outcomes(trade_id, number, title) values ($1,'9','x')`, [tradeA1]))
})
await as(U.instrB, async () => {
  ok('other ITI cannot read this content', (await q('select id from learning_outcomes')).length === 0)
  ok('other ITI cannot delete (0 rows)', (await q(`delete from learning_outcomes where id=$1 returning id`, [lo1])).length === 0)
})
await as(U.adminA, async () => {
  const t = (await q(`insert into trades(iti_id, name) values ($1,'Fitter') returning id`, [itiA]))[0].id
  ok('ITI admin can add a trade', !!t)
  await throws('ITI admin cannot add a trade to another ITI', () => q(`insert into trades(iti_id, name) values ($1,'Fitter')`, [itiB]))
  await throws('ITI admin cannot create super admin', () => mem(U.newbie, 'super_admin', null, null))
  await mem(U.newbie, 'viewer', itiA, null)
  ok('ITI admin can approve a user into their ITI', true)
  await throws('trade cannot be moved to another ITI', () => q(`update trades set iti_id=$1 where id=$2`, [itiB, t]))
  await throws('ITI admin cannot create an ITI', () => q(`insert into itis(name) values ('Nope')`))
})
await as(U.newbie, async () => ok('approved user now sees ITI-A trades', (await q('select id from trades')).length === 3))
await as(U.root, async () => await q(`delete from memberships where user_id=$1`, [U.newbie]))

console.log('\nLast-edit tracking & history')
await as(U.instrA, async () => { await q(`update splitup_items set content='<p>v2</p>' where id=$1`, [theory1]); await q(`update splitup_items set content='<p>v3</p>' where id=$1`, [theory1]) })
const hist = await as('root', () => q(`select old_value from content_history where row_id=$1 order by changed_at, id`, [theory1]))
ok('history keeps the overwritten versions', hist.map(h => h.old_value).join('|') === '<p>v1</p>|<p>v2</p>')
await as(U.instrA, async () => {
  ok('editor can read history', (await q('select 1 from content_history')).length >= 2)
  for (let i = 0; i < 25; i++) await q(`update splitup_items set content=$1 where id=$2`, [`<p>x${i}</p>`, theory1])
})
ok('history capped at 20 per field', (await as('root', () => q(`select count(*)::int c from content_history where row_id=$1`, [theory1])))[0].c === 20)
await as(U.viewerA, async () => ok('viewer cannot read history', (await q('select 1 from content_history')).length === 0))

console.log('\nBundle & student link')
await as(U.instrA, async () => {
  const b = (await q('select get_trade_bundle($1) b', [tradeA1]))[0].b
  ok('bundle has los/items/tasks/media/diaries', b.los.length === 2 && b.items.length === 3 && b.tasks.length === 1 && b.media.length === 1 && b.diaries.length === 1)
  ok('bundle hides the share token', !('share_token' in b.trade))
  ok('bundle LO order follows sort_order', b.los[0].number === '1')
})
await as(U.instrB, async () => { await throws('bundle denied for other ITI', () => q('select get_trade_bundle($1)', [tradeA1])) })
const tok = (await as('root', () => q('select share_token from trades where id=$1', [tradeA1])))[0].share_token
await as(null, async () => ok('public link off by default → null', (await q('select public_bundle($1) b', [tok]))[0].b === null))
await as(U.instrA, async () => await q('update trades set share_enabled=true where id=$1', [tradeA1]))
await as(null, async () => {
  const b = (await q('select public_bundle($1) b', [tok]))[0].b
  ok('public link works once enabled', b && b.items.length === 3)
  ok('public bundle hides token', !('share_token' in b.trade))
  ok('bad token → null', (await q('select public_bundle($1) b', ['nope']))[0].b === null)
})

console.log('\nRepository: publish → browse → copy')
let pkg
await as(U.viewerA, async () => { await throws('viewer cannot publish', () => q(`select publish_package($1, $2, 'T', '', 'all')`, [tradeA1, [lo1]])) })
await as(U.instrA, async () => {
  await throws('empty selection refused', () => q(`select publish_package($1, '{}', 'T', '', 'all')`, [tradeA1]))
  pkg = (await q(`select publish_package($1, $2, 'COPA Semester 1', 'LO 1 with tasks', 'all') id`, [tradeA1, [lo1]]))[0].id
  ok('published', !!pkg)
})
const pk = (await as('root', () => q('select * from repo_packages where id=$1', [pkg])))[0]
ok('package counts: 1 LO, 3 items', pk.lo_count === 1 && pk.item_count === 3)
ok('package carries tasks + media', pk.payload.los[0].items.find(i => i.number === '1.1' && i.kind === 'practical').tasks[0].media.length === 1)
await as(U.instrB, async () => {
  ok('other ITI sees "all" package', (await q('select id from repo_packages')).length === 1)
  { const j = JSON.stringify((await q('select payload from repo_packages'))[0].payload); ok('payload carries no row ids (only file paths)', ![lo1, item1, task1, theory1].some(id => j.includes(id))) }
  await throws('cannot insert into repository directly', () => q(`insert into repo_packages(lineage_id, title, payload) values (gen_random_uuid(),'x','{}')`))
  ok('cannot delete from repository (0 rows)', (await q('delete from repo_packages returning id')).length === 0)
  await throws('cannot withdraw others\' package', () => q('select set_package_status($1, $2)', [pkg, 'withdrawn']))
})
await as(U.instrA, async () => {
  const v2 = (await q(`select publish_package($1, $2, 'COPA Semester 1', 'with 2 LOs', 'iti', $3) id`, [tradeA1, [lo1], pk.lineage_id]))[0].id
  ok('new version gets version 2 in same lineage', (await as('root', () => q('select version, lineage_id from repo_packages where id=$1', [v2])))[0].version === 2)
})
await as(U.instrB, async () => ok('ITI-only version hidden from other ITI, v1 still visible', (await q('select version from repo_packages')).map(r => r.version).join() === '1'))
await as(U.instrA, async () => ok('own ITI sees both versions', (await q('select id from repo_packages')).length === 2))

// copy into ITI B trade
await as(U.viewerA, async () => { await throws('viewer cannot import', () => q('select import_package($1,$2)', [pkg, tradeA1])) })
await as(U.instrB, async () => {
  const r = (await q('select import_package($1,$2) r', [pkg, tradeB1]))[0].r
  ok('import creates LO 1', r.created.join() === '1' && r.skipped.length === 0)
  const own = await q('select id, source_version, source_package_id from learning_outcomes where trade_id=$1', [tradeB1])
  ok('copy remembers its source', own.length === 1 && own[0].source_version === 1 && own[0].source_package_id === pkg)
  ok('copied items & tasks exist', (await q('select count(*)::int c from splitup_items'))[0].c === 3 && (await q('select count(*)::int c from tasks'))[0].c === 1)
  ok('copy is independent — editing leaves original untouched', (await q(`update learning_outcomes set title='My Safety' where trade_id=$1 returning id`, [tradeB1])).length === 1)
  const r2 = (await q('select import_package($1,$2) r', [pkg, tradeB1]))[0].r
  ok('second import skips existing LO', r2.skipped.join() === '1' && r2.created.length === 0)
  const r3 = (await q(`select import_package($1,$2,null,'replace') r`, [pkg, tradeB1]))[0].r
  ok('replace mode overwrites', r3.replaced.join() === '1' && (await q('select title from learning_outcomes where trade_id=$1', [tradeB1]))[0].title === 'Safety')
  await throws('cannot import into a trade you cannot edit', () => q('select import_package($1,$2)', [pkg, tradeA1]))
})
await as(U.instrA, async () => ok('original in ITI A unchanged by the copy', (await q(`select title from learning_outcomes where id=$1`, [lo1]))[0].title === 'Safety'))
await as(U.instrA, async () => { await q(`select set_package_status($1,'withdrawn')`, [pkg]) })
await as(U.instrB, async () => ok('withdrawn package disappears from others', (await q('select id from repo_packages')).length === 0))

console.log('\nShared media deletion')
// the B copy shares the storage path with A
await as(U.instrB, async () => {
  const m = (await q('select id from media'))[0].id
  ok('deleting the copy’s media does NOT release the file (still used by A)', (await q('select delete_media($1) p', [m]))[0].p === null)
})
await as(U.instrA, async () => {
  const m = (await q('select id from media'))[0].id
  ok('A deleting last row still keeps file while a published package references it', (await q('select delete_media($1) p', [m]))[0].p === null)
})
await as(U.instrA, async () => {
  await q(`insert into media(item_id, path) values ($1,'x/orphan.jpg')`, [item1])
  const m = (await q(`select id from media where path='x/orphan.jpg'`))[0].id
  ok('unreferenced file path is returned for cleanup', (await q('select delete_media($1) p', [m]))[0].p === 'x/orphan.jpg')
})

console.log('\nStorage policy')
await as(U.instrA, async () => {
  await q(`insert into storage.objects(bucket_id, name) values ('media', $1)`, [`${tradeA1}/f.jpg`])
  ok('editor can upload into their trade folder', true)
  await throws('editor cannot upload into another ITI’s folder', () => q(`insert into storage.objects(bucket_id, name) values ('media', $1)`, [`${tradeB1}/f.jpg`]))
  await throws('junk folder name rejected', () => q(`insert into storage.objects(bucket_id, name) values ('media', 'junk/f.jpg')`))
})
await as(U.viewerA, async () => { await throws('viewer cannot upload', () => q(`insert into storage.objects(bucket_id, name) values ('media', $1)`, [`${tradeA1}/v.jpg`])) })

console.log('\nDiary')
await as(U.instrA, async () => {
  const d = (await q('select id from diaries'))[0].id
  await q(`insert into diary_entries(diary_id, week_start, day_idx, entry_date, practical_no, practical_title) values ($1,'2026-07-06',0,'2026-07-06','1.10','Measuring')`, [d])
  await throws('one entry per diary/week/day', () => q(`insert into diary_entries(diary_id, week_start, day_idx) values ($1,'2026-07-06',0)`, [d]))
  ok('diary entry stores text numbers & trade_id', (await q('select practical_no, trade_id from diary_entries'))[0].practical_no === '1.10')
  await throws('diary names unique per trade', () => q(`insert into diaries(trade_id, name) values ($1,'COPA A Batch')`, [tradeA1]))
})
await as(U.instrB, async () => ok('other ITI cannot see diary', (await q('select 1 from diary_entries')).length === 0))

console.log('\nProfiles')
await as(U.instrA, async () => {
  ok('user sees own profile only', (await q('select id from profiles')).length === 1)
  await q(`update profiles set full_name='Renamed' where id=$1`, [U.instrA]); ok('user edits own profile', true)
  ok('cannot edit someone else’s profile', (await q(`update profiles set full_name='x' where id=$1 returning id`, [U.instrB])).length === 0)
})
await as(U.adminA, async () => {
  const ids = (await q('select id from profiles')).map(r => r.id)
  ok('ITI admin sees own-ITI people + the person who asked to join, not the other ITI', ids.includes(U.instrA) && ids.includes(U.newbie) && !ids.includes(U.instrB) && !ids.includes(U.adminB))
})
await as(U.adminB, async () => ok('other ITI admin cannot see ITI A’s people', !(await q('select id from profiles')).some(r => r.id === U.instrA)))
await as(U.root, async () => ok('super admin sees everyone', (await q('select id from profiles')).length === 8))

console.log('\nCascade')
await as(U.adminA, async () => { await q('delete from trades where id=$1', [tradeA1]) })
ok('deleting a trade removes all its content', (await as('root', () => q(`select (select count(*) from learning_outcomes where trade_id=$1)+(select count(*) from tasks where trade_id=$1)+(select count(*) from diary_entries where trade_id=$1) c`, [tradeA1])))[0].c == 0)
ok('published packages survive trade deletion', (await as('root', () => q('select count(*)::int c from repo_packages')))[0].c === 2)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
