// Builds a deliberately messy "old logbook" workbook and runs the real migration into the real schema.
//   npm run test:migrate
import * as XLSX from 'xlsx'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeShim } from './shim/core.js'
import { migrate, parseLegacy, summarize } from '../scripts/migrate-copa.mjs'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? '  ✓' : '  ✗ FAIL:', name, cond ? '' : extra) }

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64')
const jobs = [['JobID', 'LOId', 'JobName', 'Theory']]
for (let i = 1; i <= 9; i++) jobs.push([Number('1.' + i), 1, 'Job one-' + i, i === 3 ? '<p>Remember safety</p>' : ''])   // numbers!
jobs.push([1.1, 1, 'Job one-ten', ''])          // really 1.10 (Sheets turned it into the number 1.1)
jobs.push([1.11, 1, 'Job one-eleven', ''])
jobs.push(['2.1', 2, 'Job two-one', ''])
jobs.push([null, '#NUM!', null, null])
const tasks = [['TaskID', 'JobID', 'LOId', 'TaskName', 'Aim', 'Procedure', 'Result', 'Conclusion'],
  ['1.1.1', 1.1, 1, 'Task A', 'aim A', 'proc A', '', ''],
  ['1.10.1', 1.1, 1, 'Task for ten', 'aim ten', 'proc ten', 'res', 'con'],
  ['2.1.1', '2.1', 2, 'Task two', '', 'p', '', ''],
  ['9.9.9', '9.9', 9, 'Orphan task', '', '', '', '']]
const big = '<p>part1 </p><img src="data:image/png;base64,' + png + '"><p> part2</p>'
const lessons = [['LessonID', 'LOId', 'LessonName', 'Content']]
for (let i = 1; i <= 9; i++) lessons.push([Number('1.' + i), 1, i === 9 ? '1.9: Memory' : 'Lesson one-' + i, i === 2 ? big.slice(0, 30) : '', i === 2 ? big.slice(30) : ''])  // content split over D,E
lessons.push([1.1, 1, 'Lesson one-ten', '<p>ten</p>'])
lessons.push(['2.1', 2, 'Lesson two-one', '<p>two</p>'])
lessons.push([1.2, 1, 'Lesson one-2', ''])                       // an extra, shorter copy of lesson 1.2 (old bug) → merged
lessons.push(['2.1', 2, 'A different lesson', 'x'])               // same text number, different name → reported
const media = [['OwnerKey', 'FileIndex', 'FileName', 'MimeType', 'Base64Data', 'FileType'],
  ['1.1.1', 1, 'a.png', 'image/png', png, 'photo'], ['job-1.1', 1, 'jobphoto.png', 'image/png', 'data:image/png;base64,' + png, 'photo'],
  ['lesson-1.2', 1, 'notes.pdf', 'application/pdf', Buffer.from('%PDF-1.4 test').toString('base64'), 'file'],
  ['theory-lo-1', 1, 'x.png', 'image/png', png, 'photo'], ['job-7.7', 1, 'lost.png', 'image/png', png, 'photo']]
const diary = [['WeekKey', 'Day', 'Date', 'ExNo', 'PracticalTitle', 'TheoryNo', 'TheoryTitle', 'ITI', 'Batch'],
  ['2026-W27', 'Mon', '2026-06-29', 1.1, 'Job one-ten', '1.2', 'Lesson one-2', '', ''],       // numeric 1.1 whose title says it is 1.10; ITI/batch blank = old default
  ['2026-W27', 'Tue', '2026-06-30', '1.1', 'Job one-1', '', '', 'dhanuvachapuram', 'B'],
  ['2026-W27', 'Mon', '2026-06-29', '2.1', 'Job two-one', '', '', 'nedumangad', 'A']]
const settings = [['Key', 'Value'], ['classStart:dhanuvachapuram', '2026-07-01'], ['classStart:dhanuvachapuram:A', '2026-08-03']]
const wb0 = XLSX.utils.book_new()
for (const [n, a] of [['Jobs', jobs], ['Tasks', tasks], ['Lessons', lessons], ['Media', media], ['Diary', diary], ['Settings', settings]]) XLSX.utils.book_append_sheet(wb0, XLSX.utils.aoa_to_sheet(a), n)
const wb = XLSX.read(XLSX.write(wb0, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellDates: true })

console.log('\nParsing the old workbook')
const data = parseLegacy(wb)
console.log(summarize(data).split('\n').map((l) => '    ' + l).join('\n'))
ok('1.1 repeated after 1.9 becomes job 1.10', data.jobs.some((j) => j.number === '1.10' && j.title === 'Job one-ten') && data.jobs.some((j) => j.number === '1.1' && j.title === 'Job one-1'))
ok('1.11 stays 1.11', data.jobs.some((j) => j.number === '1.11'))
ok('junk #NUM! row ignored', data.jobs.length === 12)
ok('task 1.10.1 is attached to job 1.10 (not 1.1)', data.tasks.find((t) => t.number === '1.10.1')?.job === '1.10')
ok('orphan task reported, not silently dropped', data.warnings.some((w) => /9\.9\.9/.test(w)))
ok('lesson 1.1 repeat → 1.10', data.lessons.some((l) => l.number === '1.10' && l.title === 'Lesson one-ten'))
ok('repeated copy merged, richest content kept; clash with a different name is reported', data.lessons.filter((l) => l.number === '1.2').length === 1 && data.warnings.some((w) => /A different lesson/.test(w)))
ok('lesson text split over columns is joined', data.lessons.find((l) => l.number === '1.2').content === big)
ok('typed number removed from lesson name', data.lessons.find((l) => l.number === '1.9').title === 'Memory')
ok('theory-… media ignored; media of a missing job reported', data.media.length === 3 && data.warnings.some((w) => /lost\.png/.test(w)))
ok('diary: numeric 1.1 with title "Job one-ten" is repaired to 1.10', data.diary.find((e) => e.exNo === '1.10'))
ok('diary: blank ITI/batch = Dhanuvachapuram / B (the old default)', data.diary[0].iti === 'dhanuvachapuram' && data.diary[0].batch === 'B')
ok('ISO week 2026-W27 → Monday 2026-06-29', data.diary[0].week === '2026-06-29')

console.log('\nMigrating into the real schema')
const stubSql = readFileSync('tests/supabase-stub.sql', 'utf8'), schemaSql = readFileSync('supabase/schema.sql', 'utf8')
let sess = null
const shim = makeShim({ stubSql, schemaSql, dataDir: 'memory://', session: { get: () => sess, set: (s) => (sess = s) },
  toDataUrl: async (b) => 'data:application/octet-stream;base64,' + Buffer.from(b.arrayBuffer ? await b.arrayBuffer() : b).toString('base64'),
  publicUrlFor: (p) => 'https://files.test/media/' + p })
const sb = shim.createClient()
await sb.auth.signUp({ email: 'boss@x.in', password: 'pw123456', options: { data: { full_name: 'Boss' } } })
await shim.exec(`insert into memberships(user_id, role) select id,'super_admin' from profiles where email='boss@x.in'`)
const q = async (s, p) => (await shim.exec(s, p)).rows
const logs = []
const res = await migrate({ supabase: sb, data, log: (m) => logs.push(m) })
logs.forEach((l) => console.log('   ', l))

ok('two ITIs and two COPA trades exist', (await q('select count(*)::int c from itis'))[0].c === 2 && (await q('select count(*)::int c from trades'))[0].c === 2)
const P = res.primaryTrade
ok('LO 1 and LO 2 created with their real names', JSON.stringify((await q('select number,title from learning_outcomes where trade_id=$1 order by number', [P])).map((r) => r.number)) === '["1","2"]')
ok('jobs 1.1 and 1.10 are separate rows', (await q(`select count(*)::int c from splitup_items where trade_id=$1 and kind='practical' and number in ('1.1','1.10')`, [P]))[0].c === 2)
ok('task 1.10.1 sits under job 1.10', (await q(`select i.number from tasks t join splitup_items i on i.id=t.item_id where t.number='1.10.1' and t.trade_id=$1`, [P]))[0]?.number === '1.10')
ok('job notes kept', (await q(`select content from splitup_items where trade_id=$1 and number='1.3' and kind='practical'`, [P]))[0].content.includes('safety'))
const l2 = (await q(`select content from splitup_items where trade_id=$1 and number='1.2' and kind='theory'`, [P]))[0].content
ok('pasted picture moved out of the lesson text into storage', !/data:image/.test(l2) && /https:\/\/files\.test\/media\//.test(l2) && l2.includes('part1') && l2.includes('part2'))
ok('3 files stored for the primary trade (task photo, job photo, lesson PDF)', (await q('select count(*)::int c from media where trade_id=$1', [P]))[0].c === 3)
ok('stored objects exist with correct folder', (await q(`select count(*)::int c from storage.objects where name like $1`, [P + '/%']))[0].c === 4)
const pkg = (await q('select * from repo_packages'))[0]
ok('COPA published to the repository', pkg && pkg.lo_count === 2 && pkg.status === 'published' && pkg.visibility === 'all')
const N = (await q(`select t.id from trades t join itis i on i.id=t.iti_id where i.name like '%Nedumangad%'`))[0].id
ok('Nedumangad has its own editable copy (LOs, jobs, tasks, files)', (await q('select count(*)::int c from learning_outcomes where trade_id=$1', [N]))[0].c === 2 && (await q(`select count(*)::int c from tasks where trade_id=$1`, [N]))[0].c === 3 && (await q('select count(*)::int c from media where trade_id=$1', [N]))[0].c === 3)
ok('copy remembers where it came from', (await q('select count(*)::int c from learning_outcomes where trade_id=$1 and source_package_id is not null', [N]))[0].c === 2)
ok('four diaries (A and B × 2 ITIs)', (await q('select count(*)::int c from diaries'))[0].c === 4)
const dB = (await q(`select d.class_start_date::text s, d.name from diaries d where d.trade_id=$1 order by d.name`, [P]))
ok('class start dates: B = 2026-07-01, A = 2026-08-03', dB[1].s === '2026-07-01' && dB[0].s === '2026-08-03', JSON.stringify(dB))
const ents = await q(`select d.name, e.day_idx, e.practical_no, e.theory_no, (e.practical_item_id is not null) linked from diary_entries e join diaries d on d.id=e.diary_id where e.trade_id=$1 order by d.name, e.day_idx`, [P])
ok('old default diary → COPA B Batch with 2 entries; 1.10 kept as 1.10 and linked to the job', ents.filter((e) => e.name === 'COPA B Batch').length === 2 && ents.some((e) => e.practical_no === '1.10' && e.linked))
ok('COPA A Batch of Dhanuvachapuram is empty', ents.filter((e) => e.name === 'COPA A Batch').length === 0)
ok('Nedumangad A batch got its own entry', (await q(`select count(*)::int c from diary_entries e join diaries d on d.id=e.diary_id where e.trade_id=$1 and d.name='COPA A Batch'`, [N]))[0].c === 1)
let again = ''
try { await migrate({ supabase: sb, data, log: () => {} }) } catch (e) { again = e.message }
ok('running it twice is refused instead of duplicating', /already has/.test(again), again)

console.log('\nThe real uploaded lesson sheet')
const real = readdirSync('/root/.claude/uploads').flatMap((d) => { try { return readdirSync(join('/root/.claude/uploads', d)).filter((f) => f.endsWith('.xlsx')).map((f) => join('/root/.claude/uploads', d, f)) } catch { return [] } })[0]
if (real) {
  const d2 = parseLegacy(XLSX.read(readFileSync(real), { type: 'buffer', cellDates: true }))
  console.log(summarize(d2).split('\n').map((l) => '    ' + l).join('\n'))
  ok('real sheet: 22 lessons 1.1–1.22 (1.10 and 1.20 repaired), nothing flagged', d2.lessons.length === 22 && d2.lessons.some((l) => l.number === '1.10' && /Booting/.test(l.title)) && d2.lessons.some((l) => l.number === '1.20') && d2.warnings.length === 0)
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
