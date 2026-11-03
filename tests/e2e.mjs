// End-to-end UI test. Runs the real app (built with VITE_USE_SHIM=1 → in-browser Postgres with the real
// security rules) in headless Chromium.   npm run test:e2e
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist-shim')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.svg': 'image/svg+xml' }
const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    const f = join(root, p === '/' ? 'index.html' : p)
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f))
  } catch { res.writeHead(404); res.end('nf') }
})
await new Promise((r) => server.listen(4173, r))
const URL0 = 'http://localhost:4173/'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) problems.push('CONSOLE ' + m.text()) })
page.on('dialog', (d) => d.accept())

let pass = 0, fail = 0, n = 0
async function step(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name) }
  catch (e) {
    fail++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      '))
    await page.screenshot({ path: `/tmp/e2e-fail-${++n}.png` }).catch(() => {})
  }
}
const sql = (s, p) => page.evaluate(([s, p]) => window.__shim.exec(s, p).then((r) => r.rows), [s, p])
const expectText = async (t, o = {}) => page.getByText(t, { exact: false }).first().waitFor({ timeout: 6000, ...o })
const go = async (hash) => { await page.evaluate((h) => (location.hash = h), hash); await page.waitForTimeout(250) }
const nav = (name) => page.locator('.side').getByText(name, { exact: false }).first().click()
const modal = () => page.locator('.modal')
const field = (label) => modal().locator('.field', { hasText: label }).locator('input,textarea,select').first()
async function signup(name, email, itiName) {
  await page.getByText('Create an account').click()
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Your ITI').selectOption({ label: itiName })
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('secret123')
  await page.getByLabel('Repeat password').fill('secret123')
  await page.getByRole('button', { name: 'Create account' }).click()
}
async function login(email, pw = 'secret123') {
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
const signOut = async () => {
  if (!(await page.getByRole('button', { name: 'Sign out' }).count())) await page.getByRole('button', { name: /👤/ }).click()
  await page.getByRole('button', { name: 'Sign out' }).click(); await page.getByRole('heading', { name: 'Sign in' }).waitFor()
}
const editOn = async () => { if (!(await page.locator('.edit-banner').count())) await page.locator('.edit-pill').click() }
const shot = async (name, w = 1300) => { if (!process.env.SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: false }) }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

console.log('\nSetup')
await page.goto(URL0)
await page.waitForFunction(() => window.__shim, null, { timeout: 60000 })
await sql(`insert into itis(name, short_name, print_title) values ('Govt. ITI Dhanuvachapuram','ITI Dhanuvachapuram',''), ('Govt. ITI Nedumangad','ITI Nedumangad','')`)

await step('sign-up page lists the ITIs and creates an account', async () => {
  await page.reload(); await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  await signup('Dinoj Admin', 'admin@x.in', 'Govt. ITI Dhanuvachapuram')
  await expectText('Waiting for approval')
})
await step('new account stays on the waiting page until approved', async () => {
  await page.getByRole('button', { name: 'Check again' }).click()
  await expectText('Waiting for approval')
  await sql(`insert into memberships(user_id, role) select id,'super_admin' from profiles where email='admin@x.in'`)
  await page.getByRole('button', { name: 'Check again' }).click()
  await expectText('No trade to show yet')
})

console.log('\nSettings: ITI + trade')
await step('edit ITI print heading', async () => {
  await go('/settings/itis')
  await expectText('Govt. ITI Dhanuvachapuram')
  await page.locator('.card', { hasText: 'Dhanuvachapuram' }).getByRole('button', { name: 'Edit' }).click()
  await field('Heading line 2').fill('Thiruvananthapuram, Kerala')
  await modal().getByRole('button', { name: 'Save' }).click()
  await expectText('Thiruvananthapuram, Kerala')
})
await step('add trades to both ITIs', async () => {
  await go('/settings/trades')
  await page.getByRole('button', { name: '＋ Add trade' }).click()
  await field('ITI').selectOption({ label: 'Govt. ITI Nedumangad' })
  await field('Trade name').fill('Electrician'); await modal().getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '＋ Add trade' }).click()
  await field('ITI').selectOption({ label: 'Govt. ITI Dhanuvachapuram' })
  await field('Trade name').fill('Computer Operator and Programming Assistant'); await field('Short code').fill('COPA')
  await modal().getByRole('button', { name: 'Save' }).click()
  await expectText('COPA')
  const t = await sql('select name from trades order by name'); if (t.length !== 2) throw new Error('trades: ' + JSON.stringify(t))
})
await step('trade switcher shows the new trade', async () => {
  await go('/')
  await page.getByRole('heading', { name: 'Computer Operator and Programming Assistant' }).waitFor()
})

console.log('\nSyllabus')
await step('add a learning outcome', async () => {
  await editOn()
  await page.getByRole('button', { name: '＋ Add learning outcome' }).click()
  await field('Title').fill('Computer fundamentals'); await modal().getByRole('button', { name: 'Save' }).click()
  await expectText('Computer fundamentals')
})
await step('add split-up: practical jobs one by one, theory by pasted list', async () => {
  await page.locator('.lo-row a', { hasText: 'Computer fundamentals' }).click()
  await page.locator('[data-kind=practical]').getByRole('button', { name: /Add job/ }).click()
  if ((await field('Number').inputValue()) !== '1.1') throw new Error('suggested number should be 1.1')
  await field('Job name').fill('Identify hardware parts'); await field('Hours').fill('8'); await modal().getByRole('button', { name: 'Save' }).click()
  await expectText('Identify hardware parts')
  await page.locator('[data-kind=theory]').getByRole('button', { name: 'Paste list' }).click()
  await modal().locator('textarea').fill('1.1 Introduction to computers | 4\n1.2 Number systems | 6\n1.10 Operating system basics | 5\n1.9 Memory')
  await expectText('4 will be added')
  await modal().getByRole('button', { name: 'Add 4' }).click()
  await modal().waitFor({ state: 'detached', timeout: 15000 })
  await expectText('Operating system basics')
})
await step('1.9 sorts before 1.10 and 1.1 stays separate from 1.10', async () => {
  const nums = await page.locator('[data-kind=theory] td.num').allInnerTexts()
  if (nums.join() !== '1.1,1.2,1.9,1.10') throw new Error('order: ' + nums.join())
})
await step('duplicate number is refused with a friendly message', async () => {
  await page.locator('[data-kind=theory]').getByRole('button', { name: /Add lesson/ }).click()
  await field('Number').fill('1.10'); await field('Lesson name').fill('dup'); await modal().getByRole('button', { name: 'Save' }).click()
  await expectText('already exists')
  await modal().getByRole('button', { name: 'Cancel' }).click()
})

console.log('\nTasks & photos')
await step('add a task with a photo to the job', async () => {
  await page.locator('[data-kind=practical] a', { hasText: 'Identify hardware parts' }).click()
  await page.getByRole('button', { name: '＋ Add task' }).click()
  await field('Task name').fill('Open the CPU cabinet')
  await field('Aim').fill('To identify the parts inside a CPU cabinet')
  await field('Procedure').fill('1. Switch off\n2. Remove side panel')
  await modal().getByRole('button', { name: 'Save task' }).click()
  await expectText('Open the CPU cabinet')
  await page.locator('.task input[type=file]').setInputFiles({ name: 'cpu.png', mimeType: 'image/png', buffer: png })
  await page.locator('.task .thumb img').waitFor({ timeout: 8000 })
})
await step('task text and photo survive a full reload', async () => {
  await page.reload(); await page.getByText('Open the CPU cabinet').waitFor()
  await page.locator('.task .thumb').waitFor()
  await expectText('2. Remove side panel')
})
await step('job sheet prints with ITI heading, task and photo', async () => {
  await shot('item-page')
  await page.getByRole('link', { name: /Job sheet/ }).click()
  await expectText('JOB SHEET'); await expectText('Thiruvananthapuram, Kerala'); await expectText('Open the CPU cabinet')
  if (!(await page.locator('.sheet img').count())) throw new Error('photo missing on sheet')
  await shot('job-sheet')
})

console.log('\nTheory notes')
await step('write lesson notes in the rich editor and save', async () => {
  await shot('home')
  await go('/'); await editOn()
  await page.locator('.lo-row a').first().click()
  await page.locator('[data-kind=theory] a', { hasText: 'Introduction to computers' }).click()
  await page.locator('.ProseMirror').click(); await page.keyboard.type('A computer is an electronic machine.'); await shot('theory-editor')
  await page.getByRole('button', { name: 'Save notes' }).click()
  await expectText('Notes saved')
})
await step('edit again; the first version is kept in history and can be restored', async () => {
  await page.locator('.ProseMirror').click(); await page.keyboard.press('Control+A'); await page.keyboard.type('Second version.')
  await page.getByRole('button', { name: 'Save notes' }).click(); await expectText('Notes saved')
  await page.getByRole('button', { name: /Earlier versions/ }).click()
  await expectText('A computer is an electronic machine'); await modal().getByRole('button', { name: 'Restore' }).first().click()
  await page.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent.includes('electronic machine'))
})
await step('notes persist after reload and render in read mode', async () => {
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await page.reload(); await editOn(); await page.locator('.ProseMirror').waitFor()
  if (!(await page.locator('.ProseMirror').innerText()).includes('Second version')) throw new Error('editor shows old text')
  await page.locator('.edit-pill').click()
  await page.locator('.prose', { hasText: 'Second version' }).waitFor()
})
await step('script in notes is neutralised', async () => {
  await sql(`update splitup_items set content='<p>ok</p><img src=x onerror="window.__xss=1"><script>window.__xss=2</script>' where title='Memory'`)
  const id = (await sql(`select id from splitup_items where title='Memory'`))[0].id
  await go('/item/' + id); await expectText('ok'); await page.waitForTimeout(400)
  if (await page.evaluate(() => window.__xss)) throw new Error('XSS executed')
})

console.log('\nDiary')
await step('add a diary with class start date', async () => {
  await editOn(); await nav('Student diary').catch(() => {})
  await go('/diary')
  await page.getByRole('button', { name: '＋ Add diary' }).click()
  await field('Diary name').fill('COPA A Batch'); await field('Class start date').fill('2026-07-01'); await modal().getByRole('button', { name: 'Save' }).click()
  await modal().waitFor({ state: 'detached', timeout: 15000 })
  if ((await sql('select count(*)::int c from diaries'))[0].c !== 1) throw new Error('diary not saved')
  await page.locator('.side a', { hasText: 'COPA A Batch' }).waitFor()
})
await step('weeks are numbered from the class start date', async () => {
  await page.goto(URL0 + '#/diary?w=2026-06-29'); await page.reload(); await editOn()
  await page.locator('.dp-week span', { hasText: /^Week 1$/ }).waitFor(); await page.locator('.dp-week span', { hasText: /^Week 3$/ }).waitFor()
})
await step('typing an exercise no. fetches the job name; lesson no. 1.10 fetches 1.10 (not 1.1)', async () => {
  const row = page.locator('.dp-table tbody tr').first()
  await row.getByLabel('Exercise number').fill('1.1'); await row.getByLabel('Exercise number').blur()
  await page.waitForTimeout(500)
  if ((await row.getByLabel('Practical job title').inputValue()) !== 'Identify hardware parts') throw new Error('job title not fetched')
  await row.getByLabel('Lesson number').fill('1.10'); await row.getByLabel('Lesson number').blur()
  await page.waitForTimeout(500)
  const t = await row.getByLabel('Theory lesson title').inputValue()
  if (t !== 'Operating system basics') throw new Error('lesson title: ' + t)
})
await step('a hand-edited title is not overwritten when the number changes later', async () => {
  const row = page.locator('.dp-table tbody tr').first()
  await row.getByLabel('Theory lesson title').fill('OS basics (my wording)'); await row.getByLabel('Theory lesson title').blur()
  await row.getByLabel('Lesson number').fill('1.2'); await row.getByLabel('Lesson number').blur(); await page.waitForTimeout(400)
  const t = await row.getByLabel('Theory lesson title').inputValue()
  if (t !== 'OS basics (my wording)') throw new Error('overwritten: ' + t)
})
await step('suggestion box lists numbers with names and picking fills the row', async () => {
  const row = page.locator('.dp-table tbody tr').nth(1)
  await row.getByLabel('Lesson number').click()
  await page.locator('.suggest div', { hasText: 'Memory' }).waitFor(); await shot('diary-suggest')
  await page.locator('.suggest div', { hasText: 'Memory' }).click(); await page.waitForTimeout(500)
  if ((await row.getByLabel('Theory lesson title').inputValue()) !== 'Memory') throw new Error('pick did not fill title')
  if ((await row.getByLabel('Lesson number').inputValue()) !== '1.9') throw new Error('number not set')
})
await step('diary entries persist after reload (1.10 stays 1.10)', async () => {
  await page.reload(); await editOn(); await page.locator('.dp-table').first().waitFor()
  const v = await page.locator('.dp-table tbody tr').first().getByLabel('Lesson number').inputValue()
  if (v !== '1.2') throw new Error('first row lesson no ' + v)
  const rows = await sql(`select practical_no, theory_no from diary_entries order by day_idx`)
  if (rows[0].practical_no !== '1.1' || rows[1].theory_no !== '1.9') throw new Error(JSON.stringify(rows))
})
await step('print-all shows only filled weeks, 3 weeks per page', async () => {
  await page.getByRole('link', { name: /Print all diary/ }).click()
  await expectText('Print (1 week · 1 A4 page)')
  if ((await page.locator('.dp-page').count()) !== 1) throw new Error('pages')
})

await step('A4 print: 7 filled weeks → 3 pages (3 + 3 + 1), 3 weeks per page', async () => {
  const d = (await sql(`select id from diaries`))[0].id
  for (let w = 0; w < 7; w++) {
    const mon = new Date(2026, 5, 29 + 7 * w), iso = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
    await sql(`insert into diary_entries(diary_id, week_start, day_idx, practical_no, practical_title) values ($1,$2,0,'1.1','Identify hardware parts') on conflict (diary_id, week_start, day_idx) do nothing`, [d, iso])
  }
  await page.reload(); await page.getByText('Print (7 weeks · 3 A4 pages)').waitFor()
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: false })
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
  if (pages !== 3) throw new Error('PDF has ' + pages + ' pages, expected 3')
  const one = await page.evaluate(() => [...document.querySelectorAll('.dp-page')].map((p) => p.querySelectorAll('.dp-block').length))
  if (one.join() !== '3,3,1') throw new Error('blocks per page ' + one)
})

console.log('\nRepository: share → copy → edit as own')
await step('publish COPA to the repository', async () => {
  await go('/'); await editOn()
  await page.getByRole('button', { name: /Share to repository/ }).click()
  await modal().locator('input').nth(0).waitFor()
  await modal().getByRole('button', { name: /Publish 1 learning outcome/ }).click()
  await expectText('Published to the repository')
  const r = await sql('select title, lo_count, item_count from repo_packages'); if (r.length !== 1 || r[0].item_count !== 5) throw new Error(JSON.stringify(r))
})
await step('second user signs up for the other ITI and is approved by the admin', async () => {
  await signOut(); await signup('Nedumangad Instr', 'ned@x.in', 'Govt. ITI Nedumangad')
  await expectText('Waiting for approval'); await signOut()
  await login('admin@x.in'); await go('/settings/users')
  await expectText('Nedumangad Instr'); await shot('users')
  await page.locator('div', { hasText: 'Nedumangad Instr' }).getByRole('button', { name: 'Approve…' }).first().click()
  await modal().getByRole('button', { name: 'Give access' }).click()
  await expectText('Access given'); await signOut()
})
await step('other ITI instructor sees the repository and copies the syllabus into their trade', async () => {
  await login('ned@x.in'); await expectText('Electrician')
  await nav('Shared repository'); await page.locator('.card h3', { hasText: 'Computer Operator' }).waitFor(); await shot('repository')
  await page.getByRole('button', { name: 'Use a copy…' }).click()
  await modal().getByRole('button', { name: /Copy 1 LO/ }).click()
  await page.getByRole('heading', { name: 'Electrician' }).waitFor()
  await expectText('Computer fundamentals'); await expectText('copied v1')
})
await step('the copy is editable and the original is not affected', async () => {
  await editOn(); await page.locator('.lo-row a', { hasText: 'Computer fundamentals' }).click()
  await page.getByRole('button', { name: '✎ Edit' }).click()
  await field('Title').fill('Basics of electricity'); await modal().getByRole('button', { name: 'Save' }).click()
  await expectText('Basics of electricity')
  const t = await sql(`select l.title, t.name from learning_outcomes l join trades t on t.id=l.trade_id order by t.name`)
  if (t.length !== 2 || !t.some((x) => x.title === 'Computer fundamentals')) throw new Error(JSON.stringify(t))
})
await step('copied tasks keep their photos', async () => {
  await page.locator('[data-kind=practical] td a').first().click()
  await page.locator('.task .thumb img').waitFor({ timeout: 6000 })
})
await step('this instructor cannot see or edit the other ITI’s trade', async () => {
  await page.locator('select[aria-label="Trade"] option').allInnerTexts().then((o) => { if (o.some((x) => /Computer Operator/.test(x))) throw new Error('leak: ' + o.join()) })
})

console.log('\nStudent link + viewer')
await step('admin enables the student link', async () => {
  await signOut(); await login('admin@x.in'); await go('/settings/trades')
  await page.getByLabel('Student read-only link').first().click()
  await page.locator('input[aria-label="Student link"]').waitFor()
})
let studentUrl
await step('student link works without login and is read-only', async () => {
  studentUrl = await page.locator('input[aria-label="Student link"]').inputValue()
  await signOut()
  await page.goto(studentUrl); await page.reload()
  await expectText('Read-only student view'); await expectText('Computer fundamentals')
  if (await page.locator('.edit-pill').count()) throw new Error('edit pill visible to students')
  await page.locator('.side a', { hasText: 'COPA A Batch' }).click(); await page.locator('.dp-week span', { hasText: /^Week \d+$/ }).first().waitFor()
  if (await page.getByLabel('Exercise number').count()) throw new Error('inputs visible')
})
await step('a wrong student token shows a friendly message', async () => {
  await page.goto(URL0 + '#/s/wrongtoken'); await page.reload(); await expectText('Link not available')
})
await step('viewer role cannot edit', async () => {
  await page.goto(URL0); await page.reload(); await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  await signup('View Only', 'view@x.in', 'Govt. ITI Dhanuvachapuram'); await expectText('Waiting for approval'); await signOut()
  await sql(`insert into memberships(user_id, role, iti_id) select id,'viewer',(select id from itis where short_name='ITI Dhanuvachapuram') from profiles where email='view@x.in'`)
  await login('view@x.in'); await expectText('Computer fundamentals')
  if (await page.locator('.edit-pill').count()) throw new Error('viewer sees edit')
  const w = await page.evaluate(() => window.__shim.exec(`select count(*)::int c from learning_outcomes`).then((r) => r.rows[0].c))
  if (w < 1) throw new Error('data missing')
})
await step('password change from Settings works and old password stops working', async () => {
  await go('/settings/account')
  const box = page.locator('form', { hasText: 'Change password' })
  await box.locator('input[type=password]').nth(0).fill('newsecret99'); await box.locator('input[type=password]').nth(1).fill('newsecret99')
  await box.getByRole('button', { name: 'Change password' }).click(); await expectText('Password changed')
  await signOut(); await login('view@x.in', 'secret123')
  await expectText('Wrong e-mail or password')
  await login('view@x.in', 'newsecret99'); await expectText('Computer fundamentals')
})

console.log('\nSmall screen')
await step('mobile layout: menu opens and nothing overflows horizontally', async () => {
  await page.setViewportSize({ width: 390, height: 800 })
  await go('/'); await page.waitForTimeout(300); await shot('mobile-home')
  await page.getByRole('button', { name: 'Menu' }).click(); await page.locator('.side.open').waitFor()
  await page.locator('.scrim').click({ position: { x: 360, y: 400 } })
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (ov > 2) throw new Error('horizontal overflow ' + ov + 'px')
})

console.log('\n' + (problems.length ? 'Browser problems:\n  ' + [...new Set(problems)].join('\n  ') : 'No console errors'))
console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail || problems.length ? 1 : 0)
