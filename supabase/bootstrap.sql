-- =====================================================================
-- FIRST-TIME SETUP: make yourself the Super Admin.
-- 1. Open the app and SIGN UP with your own e-mail + password.
-- 2. Put that same e-mail below and run this in the Supabase SQL editor.
-- After that, everything else (ITIs, trades, approving people) is done
-- inside the app → Settings.
-- =====================================================================
insert into public.memberships (user_id, role)
select id, 'super_admin' from public.profiles
 where lower(email) = lower('dinojmkhan@gmail.com')
on conflict do nothing;

-- check: should show one row
select p.email, m.role from public.memberships m join public.profiles p on p.id = m.user_id where m.role = 'super_admin';
