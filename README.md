# ITI Logbook — multi-trade, multi-ITI digital logbook

Free hosting on **GitHub Pages**, data in **Supabase** (Postgres + login + file storage).
One site serves many ITIs and many trades. COPA is just the first trade (migration script included).

## What it does

| Need | Where |
|---|---|
| Users, passwords, approvals, roles | Settings → My account / Users & access |
| Add a trade (name, code, months) | Settings → Trades |
| Add ITIs | Settings → ITIs (super admin) |
| Learning outcomes | Home → "＋ Add learning outcome" (edit mode) |
| Split-up (numbered practical / theory items with hours) | Inside each learning outcome → "+ Practical job" / "+ Theory lesson", or paste a whole list |
| Logbook tasks, photos, job sheets, lesson notes | Job / lesson pages |
| Student diary (weeks, auto-fetch of tasks, A4 print) | Student diary → "+ Add diary" |
| Share to repository / copy someone else's | Home → "Share to repository"; Shared repository → "Use a copy…" |
| Student read-only link | Settings → Trades → "Student read-only link" (+ "New link" to cancel the old one) |
| Dark mode, per-computer default trade | Settings → This computer |
| Note history + restore | "Earlier versions" on any note |
| Backup (JSON + CSV downloads) | Settings → Backup |

Roles: **super_admin** (everything), **iti_admin** (one ITI: trades, users), **instructor** (edit own trade(s)), **viewer** (read only).
New people sign up and wait on a "pending" screen until an admin gives them access.

## 1. Supabase (≈10 minutes)

1. https://supabase.com → New project (free plan is fine). Keep the region close to you.
2. **SQL Editor** → paste all of `supabase/schema.sql` → Run. (Safe to re-run later.)
3. **Authentication → Providers → Email**: enabled. Either
   - turn **Confirm email** OFF (simplest; admin approval is the real gate), or
   - configure SMTP so confirmation mails are delivered (the built-in mailer is heavily rate-limited).
4. **Authentication → URL Configuration**: Site URL = your Pages URL, e.g. `https://YOURNAME.github.io/iti-logbook/`; add the same to Redirect URLs.
5. **Project Settings → API**: copy the *Project URL* and the *anon public* key. (Never put the `service_role` key anywhere in this project.)

## 2. GitHub Pages

1. Create a GitHub repo, push this folder to `main`.
2. Repo → **Settings → Pages → Source = GitHub Actions**.
3. Repo → **Settings → Secrets and variables → Actions → Variables** → add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (repository *variables*; the anon key is public by design).
4. Push (or Actions → "Deploy to GitHub Pages" → Run). The site appears at the Pages URL.
   Routing uses `#/…` so refresh and deep links work on Pages.

## 3. First super admin

1. Open the site, **Sign up** with your e-mail + password.
2. Put the same e-mail in `supabase/bootstrap.sql`, run it in the SQL editor.
3. Reload the site. Settings → ITIs / Trades / Users & access are now yours.

Everyone else: they sign up → you (or their ITI admin) open Settings → Users & access → **Approve…** and choose ITI, role and trade.

## 4. Move the existing COPA data

Export the old Google Sheet as `.xlsx` (File → Download). Then:

```bash
npm install
# look first – nothing is written:
SUPABASE_URL=... SUPABASE_ANON_KEY=... ADMIN_EMAIL=you@x.in ADMIN_PASSWORD=... \
  node scripts/migrate-copa.mjs --file old.xlsx --dry-run
# then for real:
SUPABASE_URL=... SUPABASE_ANON_KEY=... ADMIN_EMAIL=you@x.in ADMIN_PASSWORD=... \
  node scripts/migrate-copa.mjs --file old.xlsx --primary dhanuvachapuram
```

It creates both ITIs, the COPA trade, 14 learning outcomes, jobs/lessons/tasks, photos (uploaded to storage, pasted base64 images externalised), the two diaries, then **publishes COPA to the repository** and copies it into the second ITI so both start with the same syllabus (each can edit its own copy). It refuses to run if the target trade already has learning outcomes.

## 5. Local development & tests

```bash
cp .env.example .env.local   # fill in URL + anon key
npm install
npm run dev
```

`npm test` runs, with no Supabase account needed (an in-memory Postgres runs the real `schema.sql`):
- `test:db` – 88 checks of row-level security, triggers, publish/import, public link, storage rules
- `test:migrate` – 31 checks of the COPA migration on messy sample sheets
- `test:e2e` – 36 browser steps (needs `npx playwright install chromium` once)

## Good to know

- **Student link** is public and read-only (anyone with the link). Turn it off, or press "New link", in Settings → Trades.
- **Repository**: "All ITIs" packages are visible to every signed-in instructor. Choose "My ITI only" to keep it internal. Media in a copy shares the same stored files; deleting a photo only removes the file when nothing else uses it.
- **Photos** are in a public storage bucket (unguessable paths). Don't upload anything confidential.
- **Edit mode** switches off on reload on purpose, to prevent accidental edits.
- Items are ordered by their number (1.2 before 1.10); to reorder, change the number.
- **Free tier**: Supabase pauses an inactive free project after ~7 days (resume in dashboard); storage 1 GB. Images are compressed to ≤1600 px on upload. Use Settings → Backup (JSON/CSV downloads) now and then. There is no JSON re-import; to restore a syllabus use a repository copy.
- Forgot password: "Forgot password?" on the sign-in page sends a reset link (needs working e-mail delivery).
