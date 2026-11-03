# ITI Logbook — Handover for the next chat

Owner: Dinoj (Senior Instructor, COPA, Govt. ITI Dhanuvachapuram). Replaces the old Google Apps Script "COPA Digital Logbook".
State at handover: **feature-complete v1.0, all tests green, not yet deployed to a real Supabase/GitHub project.**

## 1. What the user asked for
Multi-user logbook on **GitHub Pages + Supabase** (not Vercel), usable for different trades and several ITIs:
1. Settings menu: user passwords and other settings
2. Add trade
3. Add learning outcome (LO)
4. Add split-up (numbered practical/theory items under each LO, with hours)
5. Add diary (student diary)
6. Share LO / split-up (theory + practical) as a **repository**; existing COPA data migrated into it; other users pick from the shared section, **copy it, edit as their own**
7. UI changes as needed; 8. suggest more options (done: version history, dark mode, progress bar, student link, backups, A4 diary print)

## 2. Stack
React 19 + Vite 8 + react-router-dom 7 (**HashRouter**, so Pages refresh works) · Supabase Auth (email+password, PKCE) · Postgres RLS · Storage (public bucket `media`) · TipTap v3 editor · DOMPurify on all rendered HTML · GitHub Actions → Pages, `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as repo **Variables** (anon key is public by design; never use service_role).

## 3. Data model (supabase/schema.sql — re-runnable)
`itis`, `profiles`, `memberships(user_id, role, iti_id, trade_id)`, `trades(share_enabled, share_token)`, `learning_outcomes`, `splitup_items(kind practical|theory, number text, hours, content html)`, `tasks`, `media(item_id xor task_id)`, `diaries(class_start_date)`, `diary_entries(unique diary/week_start Monday/day_idx)`, `content_history` (trigger, last 20), `repo_packages(lineage_id, version, payload jsonb snapshot, visibility all|iti, status)`.
- Roles: super_admin, iti_admin, instructor (one trade or all trades of an ITI), viewer. New sign-ups are "pending" until a membership exists.
- SECURITY DEFINER helpers: is_super_admin, is_iti_admin, is_any_admin, has_iti_access, admin_sees_user, can_read_in_iti / can_edit_in_iti (**row-based** — required for INSERT…RETURNING), can_read_trade / can_edit_trade.
- RPCs: get_trade_bundle, public_bundle(token, anon), publish_package, import_package (SECURITY INVOKER; skip/replace conflicts; copied media shares storage paths), set_package_status, delete_media (returns path only when unreferenced).
- Numbers are stored as **text**; order = natural number sort on the client (`bySort`). There are no move/reorder buttons.

## 4. Project layout
```
supabase/schema.sql, bootstrap.sql         DB + first super admin
src/main.jsx, App.jsx, styles.css          ContentRoutes shared by private app and student link (#/s/:token)
src/lib/        supabase, sanitize, util, dates, media, api, auth, data
src/components/ ui, Shell, RichEditor, MediaGallery, HistoryModal, PublishModal, LoForm
src/pages/      Auth, Home, LoPage, ItemPage, Sheets, Diary, Repository, Settings
src/pages/settings/  Account, Trades, Itis, Users, Prefs, Backup
scripts/migrate-copa.mjs                   old .xlsx -> Supabase (supports --dry-run, --primary)
tests/db.test.mjs (88)  tests/migrate.test.mjs (31)  tests/e2e.mjs (36, Playwright)
tests/supabase-stub.sql, tests/shim/{core.js,supabase-shim.js}   test double of supabase-js on PGlite
.github/workflows/deploy.yml, vite.config.js, README.md (setup steps)
```
Commands: `npm run dev | build | test | test:db | test:migrate | test:e2e` (e2e needs `npx playwright install chromium`; `SHOTS=<dir>` saves screenshots). Playwright pinned to 1.56.1.

## 5. How testing works (important when changing things)
The browser E2E builds the app with `VITE_USE_SHIM=1`, swapping `@supabase/supabase-js` for a shim over in-browser PGlite that runs the **real schema.sql** — so RLS/RPC changes are really tested. Any schema change → re-run `npm test`; add a check to `tests/db.test.mjs`.

## 6. Decisions / assumptions the user has been told about
- "Splitup" = numbered practical/theory breakdown under each LO with hours.
- Sign-up + admin approval; student read-only link is public (token); media bucket is public (unguessable paths); repository "All ITIs" packages visible to every signed-in user, or "My ITI only".
- Copies share storage files; deleting a photo removes the file only if unreferenced (orphans possible).
- Edit mode resets on reload (by design). Trade and theme remembered per computer in localStorage (`iti.trade`, `iti.theme`).
- Backup = JSON/CSV downloads; **no JSON re-import** (restore via repository copy).
- Images compressed to ≤1600 px; pasted base64 images externalised to storage.
- Migration: legacy default diary = ITI dhanuvachapuram / batch B; creates diaries "COPA A Batch"/"COPA B Batch" per ITI; 14 legacy LO names; refuses if target trade already has LOs.

## 7. Known gaps / ideas for next steps
- **Not deployed yet**: follow README (Supabase project → schema.sql → Auth settings: Confirm-email off or SMTP, Site URL/redirect = Pages URL → GitHub Pages source "GitHub Actions" + Variables → sign up → bootstrap.sql → migrate).
- Admin cannot create users directly (needs an Edge Function with service_role) — currently self sign-up + approve.
- Student sign-off on tasks, audit log, JSON re-import, orphan-file cleanup, bundle is one 705 kB chunk (could code-split).
- First real-world run may reveal differences between the shim and real Supabase (email confirmation, storage URLs, rate limits) — test the live site and report errors.

## 8. How to start the next chat
Upload `iti-logbook.zip` and this file, then say what to change. The assistant should unzip, run `npm install` and `npm test` first, then make changes and re-run the tests before delivering a new zip.
