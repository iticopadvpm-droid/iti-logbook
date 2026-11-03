-- =====================================================================
-- ITI LOGBOOK — Supabase schema
-- Run this whole file once in the Supabase SQL editor (Dashboard → SQL).
-- It is safe to run again later: tables use IF NOT EXISTS, functions and
-- policies are replaced.
--
-- Model:  ITI → Trade → Learning Outcome → Split-up item (practical | theory)
--                                              ├─ practical item → Tasks (logbook pages)
--                                              └─ theory item    → lesson notes
--         Trade → Diaries → weekly diary entries
--         Shared Repository = versioned snapshots of learning outcomes that
--         other users copy into their own trade and edit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------
create table if not exists public.itis (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  short_name     text not null default '',
  print_title    text not null default '',     -- header line 1 on printouts (blank = name)
  print_subtitle text not null default '',     -- header line 2, e.g. "Thiruvananthapuram, Kerala"
  created_at     timestamptz not null default now()
);

create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null default '',
  full_name        text not null default '',
  designation      text not null default '',
  phone            text not null default '',
  default_trade_id uuid,
  requested_iti_id uuid references public.itis(id) on delete set null,   -- ITI chosen at sign-up
  request_note     text not null default '',
  created_at       timestamptz not null default now()
);

create table if not exists public.trades (
  id              uuid primary key default gen_random_uuid(),
  iti_id          uuid not null references public.itis(id) on delete cascade,
  name            text not null,
  code            text not null default '',
  duration_months int,
  share_enabled   boolean not null default false,        -- student read-only link on/off
  share_token     text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at      timestamptz not null default now(),
  unique (iti_id, name)
);

do $$ begin
  alter table public.profiles
    add constraint profiles_default_trade_fk
    foreign key (default_trade_id) references public.trades(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Shared repository: immutable, versioned snapshots
create table if not exists public.repo_packages (
  id             uuid primary key default gen_random_uuid(),
  lineage_id     uuid not null,                     -- same for every version of one package
  version        int  not null default 1,
  title          text not null,
  description    text not null default '',
  trade_name     text not null default '',
  source_iti_id  uuid references public.itis(id) on delete set null,
  source_iti_name text not null default '',
  published_by   uuid references public.profiles(id) on delete set null,
  publisher_name text not null default '',
  visibility     text not null default 'all' check (visibility in ('all','iti')),
  status         text not null default 'published' check (status in ('published','withdrawn')),
  lo_count       int not null default 0,
  item_count     int not null default 0,
  payload        jsonb not null,
  created_at     timestamptz not null default now(),
  unique (lineage_id, version)
);
create index if not exists repo_packages_lineage on public.repo_packages(lineage_id);

create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('super_admin','iti_admin','instructor','viewer')),
  iti_id     uuid references public.itis(id) on delete cascade,
  trade_id   uuid references public.trades(id) on delete cascade,   -- null = every trade of that ITI
  created_by uuid,
  created_at timestamptz not null default now(),
  check (
    (role = 'super_admin' and iti_id is null and trade_id is null) or
    (role = 'iti_admin'   and iti_id is not null and trade_id is null) or
    (role in ('instructor','viewer') and iti_id is not null)
  )
);
create unique index if not exists memberships_unique on public.memberships (
  user_id, role,
  coalesce(iti_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(trade_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create table if not exists public.learning_outcomes (
  id                uuid primary key default gen_random_uuid(),
  trade_id          uuid not null references public.trades(id) on delete cascade,
  number            text not null,
  title             text not null,
  description       text not null default '',
  sort_order        int  not null default 0,
  source_package_id uuid references public.repo_packages(id) on delete set null,
  source_lineage_id uuid,
  source_version    int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  unique (trade_id, number)
);

create table if not exists public.splitup_items (
  id         uuid primary key default gen_random_uuid(),
  lo_id      uuid not null references public.learning_outcomes(id) on delete cascade,
  trade_id   uuid not null references public.trades(id) on delete cascade,
  kind       text not null check (kind in ('practical','theory')),
  number     text not null,
  title      text not null,
  hours      numeric(6,1),
  content    text not null default '',           -- theory: lesson notes (HTML)
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (lo_id, kind, number)
);

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.splitup_items(id) on delete cascade,
  trade_id   uuid not null references public.trades(id) on delete cascade,
  number     text not null,
  name       text not null,
  aim        text not null default '',
  procedure  text not null default '',
  result     text not null default '',
  conclusion text not null default '',
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (item_id, number)
);

create table if not exists public.media (
  id         uuid primary key default gen_random_uuid(),
  trade_id   uuid not null references public.trades(id) on delete cascade,
  item_id    uuid references public.splitup_items(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete cascade,
  path       text not null,                       -- object path inside the "media" storage bucket
  file_name  text not null default '',
  mime_type  text not null default '',
  size_bytes bigint not null default 0,
  kind       text not null default 'photo' check (kind in ('photo','file')),
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (num_nonnulls(item_id, task_id) = 1)
);
create index if not exists media_item on public.media(item_id);
create index if not exists media_task on public.media(task_id);
create index if not exists media_path on public.media(path);

create table if not exists public.diaries (
  id               uuid primary key default gen_random_uuid(),
  trade_id         uuid not null references public.trades(id) on delete cascade,
  name             text not null,                 -- e.g. "COPA A Batch"
  class_start_date date,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  unique (trade_id, name)
);

create table if not exists public.diary_entries (
  id                 uuid primary key default gen_random_uuid(),
  diary_id           uuid not null references public.diaries(id) on delete cascade,
  trade_id           uuid not null references public.trades(id) on delete cascade,
  week_start         date not null,                -- the Monday of the week
  day_idx            smallint not null check (day_idx between 0 and 6),   -- 0 = Monday
  entry_date         date,
  practical_item_id  uuid references public.splitup_items(id) on delete set null,
  practical_no       text not null default '',
  practical_title    text not null default '',
  theory_item_id     uuid references public.splitup_items(id) on delete set null,
  theory_no          text not null default '',
  theory_title       text not null default '',
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  unique (diary_id, week_start, day_idx)
);

-- Previous versions of notes/logbook text, so an overwritten lesson can be restored
create table if not exists public.content_history (
  id         uuid primary key default gen_random_uuid(),
  trade_id   uuid not null references public.trades(id) on delete cascade,
  row_table  text not null,
  row_id     uuid not null,
  field      text not null,
  old_value  text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists content_history_row on public.content_history(row_id, field, changed_at desc);

-- ---------------------------------------------------------------------
-- 2. ACCESS HELPERS (used by the security policies)
-- ---------------------------------------------------------------------
create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin return p::uuid; exception when others then return null; end $$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where user_id = auth.uid() and role = 'super_admin')
$$;

create or replace function public.is_iti_admin(p_iti uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from memberships
                  where user_id = auth.uid() and role = 'iti_admin' and iti_id = p_iti)
$$;

create or replace function public.is_any_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                  where user_id = auth.uid() and role in ('super_admin','iti_admin'))
$$;

-- an ITI admin sees people who asked to join their ITI or already belong to it
create or replace function public.admin_sees_user(p_user uuid, p_requested_iti uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or (p_requested_iti is not null and public.is_iti_admin(p_requested_iti))
      or exists (select 1 from memberships m
                  where m.user_id = p_user and m.iti_id is not null and public.is_iti_admin(m.iti_id))
$$;

create or replace function public.has_iti_access(p_iti uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from memberships where user_id = auth.uid() and iti_id = p_iti)
$$;

-- Row-level versions: take the ITI id directly, so they also work for a row that is
-- being inserted right now (a table lookup could not see it yet).
create or replace function public.can_read_in_iti(p_iti uuid, p_trade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from memberships m
                  where m.user_id = auth.uid() and m.iti_id = p_iti
                    and (m.role = 'iti_admin' or m.trade_id is null or m.trade_id = p_trade))
$$;

create or replace function public.can_edit_in_iti(p_iti uuid, p_trade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from memberships m
                  where m.user_id = auth.uid() and m.iti_id = p_iti
                    and (m.role = 'iti_admin'
                         or (m.role = 'instructor' and (m.trade_id is null or m.trade_id = p_trade))))
$$;

create or replace function public.can_read_trade(p_trade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_read_in_iti(t.iti_id, t.id) from trades t where t.id = p_trade), false)
$$;

create or replace function public.can_edit_trade(p_trade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_edit_in_iti(t.iti_id, t.id) from trades t where t.id = p_trade), false)
$$;

-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------
-- new sign-up → profile row
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, requested_iti_id, request_note)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          (select i.id from public.itis i where i.id = public.try_uuid(new.raw_user_meta_data ->> 'requested_iti')),
          left(coalesce(new.raw_user_meta_data ->> 'note', ''), 300))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- children always take trade_id from their parent (the client cannot forge it)
create or replace function public.set_trade_id() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'splitup_items' then
    select trade_id into new.trade_id from public.learning_outcomes where id = new.lo_id;
  elsif tg_table_name = 'tasks' then
    select trade_id into new.trade_id from public.splitup_items where id = new.item_id;
  elsif tg_table_name = 'media' then
    if new.item_id is not null then
      select trade_id into new.trade_id from public.splitup_items where id = new.item_id;
    else
      select trade_id into new.trade_id from public.tasks where id = new.task_id;
    end if;
  elsif tg_table_name = 'diary_entries' then
    select trade_id into new.trade_id from public.diaries where id = new.diary_id;
  end if;
  if new.trade_id is null then raise exception 'parent record not found'; end if;
  return new;
end $$;

drop trigger if exists splitup_items_trade on public.splitup_items;
create trigger splitup_items_trade before insert or update of lo_id on public.splitup_items
  for each row execute function public.set_trade_id();
drop trigger if exists tasks_trade on public.tasks;
create trigger tasks_trade before insert or update of item_id on public.tasks
  for each row execute function public.set_trade_id();
drop trigger if exists media_trade on public.media;
create trigger media_trade before insert or update of item_id, task_id on public.media
  for each row execute function public.set_trade_id();
drop trigger if exists diary_entries_trade on public.diary_entries;
create trigger diary_entries_trade before insert or update of diary_id on public.diary_entries
  for each row execute function public.set_trade_id();

-- a trade can never be moved to another ITI
create or replace function public.lock_trade_iti() returns trigger
language plpgsql as $$
begin
  if new.iti_id <> old.iti_id then raise exception 'a trade cannot be moved to another ITI'; end if;
  return new;
end $$;
drop trigger if exists trades_lock_iti on public.trades;
create trigger trades_lock_iti before update on public.trades
  for each row execute function public.lock_trade_iti();

-- a membership's trade must belong to the membership's ITI
create or replace function public.check_membership_trade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trade_id is not null
     and not exists (select 1 from trades where id = new.trade_id and iti_id = new.iti_id) then
    raise exception 'that trade does not belong to that ITI';
  end if;
  return new;
end $$;
drop trigger if exists memberships_check_trade on public.memberships;
create trigger memberships_check_trade before insert or update on public.memberships
  for each row execute function public.check_membership_trade();

-- updated_at / updated_by
create or replace function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists lo_touch on public.learning_outcomes;
create trigger lo_touch before insert or update on public.learning_outcomes
  for each row execute function public.touch_row();
drop trigger if exists items_touch on public.splitup_items;
create trigger items_touch before insert or update on public.splitup_items
  for each row execute function public.touch_row();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before insert or update on public.tasks
  for each row execute function public.touch_row();
drop trigger if exists entries_touch on public.diary_entries;
create trigger entries_touch before insert or update on public.diary_entries
  for each row execute function public.touch_row();

-- keep the last 20 previous values of every long text field
create or replace function public.log_content_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare f text; oldv text; newv text;
begin
  foreach f in array tg_argv loop
    oldv := to_jsonb(old) ->> f;
    newv := to_jsonb(new) ->> f;
    if oldv is distinct from newv and coalesce(oldv, '') <> '' then
      insert into public.content_history (trade_id, row_table, row_id, field, old_value, changed_by)
      values (old.trade_id, tg_table_name, old.id, f, oldv, auth.uid());
      delete from public.content_history
       where id in (select id from public.content_history
                     where row_id = old.id and field = f
                     order by changed_at desc, id offset 20);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists items_history on public.splitup_items;
create trigger items_history after update on public.splitup_items
  for each row execute function public.log_content_history('content');
drop trigger if exists tasks_history on public.tasks;
create trigger tasks_history after update on public.tasks
  for each row execute function public.log_content_history('aim', 'procedure', 'result', 'conclusion');

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.itis              enable row level security;
alter table public.profiles          enable row level security;
alter table public.trades            enable row level security;
alter table public.memberships       enable row level security;
alter table public.repo_packages     enable row level security;
alter table public.learning_outcomes enable row level security;
alter table public.splitup_items     enable row level security;
alter table public.tasks             enable row level security;
alter table public.media             enable row level security;
alter table public.diaries           enable row level security;
alter table public.diary_entries     enable row level security;
alter table public.content_history   enable row level security;

-- ITIs: everyone signed in can see the list (needed to pick one); only admins change it
drop policy if exists itis_select on public.itis;
create policy itis_select on public.itis for select to anon, authenticated using (true);   -- names only; needed on the sign-up page
drop policy if exists itis_insert on public.itis;
create policy itis_insert on public.itis for insert to authenticated with check (public.is_super_admin());
drop policy if exists itis_update on public.itis;
create policy itis_update on public.itis for update to authenticated
  using (public.is_iti_admin(id)) with check (public.is_iti_admin(id));
drop policy if exists itis_delete on public.itis;
create policy itis_delete on public.itis for delete to authenticated using (public.is_super_admin());

-- Profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.admin_sees_user(id, requested_iti_id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Memberships (who can do what, where)
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin() or (iti_id is not null and public.is_iti_admin(iti_id)));
drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.is_super_admin() or (role <> 'super_admin' and iti_id is not null and public.is_iti_admin(iti_id)));
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_super_admin() or (role <> 'super_admin' and iti_id is not null and public.is_iti_admin(iti_id)))
  with check (public.is_super_admin() or (role <> 'super_admin' and iti_id is not null and public.is_iti_admin(iti_id)));
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.is_super_admin() or (role <> 'super_admin' and iti_id is not null and public.is_iti_admin(iti_id)));

-- Trades
drop policy if exists trades_select on public.trades;
create policy trades_select on public.trades for select to authenticated using (public.can_read_in_iti(iti_id, id));
drop policy if exists trades_insert on public.trades;
create policy trades_insert on public.trades for insert to authenticated with check (public.is_iti_admin(iti_id));
drop policy if exists trades_update on public.trades;
create policy trades_update on public.trades for update to authenticated
  using (public.can_edit_in_iti(iti_id, id)) with check (public.can_edit_in_iti(iti_id, id));
drop policy if exists trades_delete on public.trades;
create policy trades_delete on public.trades for delete to authenticated using (public.is_iti_admin(iti_id));

-- Everything that belongs to a trade: readers read, editors write
do $$
declare t text;
begin
  foreach t in array array['learning_outcomes','splitup_items','tasks','media','diaries','diary_entries']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_trade(trade_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit_trade(trade_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_trade(trade_id)) with check (public.can_edit_trade(trade_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_trade(trade_id))', t || '_delete', t);
  end loop;
end $$;

-- History: editors can look at it (rows are written by a trigger only)
drop policy if exists content_history_select on public.content_history;
create policy content_history_select on public.content_history for select to authenticated
  using (public.can_edit_trade(trade_id));

-- Repository: visible to everyone (visibility "all") or to people of the publishing ITI ("iti");
-- publishers always see their own. Writing goes through the functions below only.
drop policy if exists repo_select on public.repo_packages;
create policy repo_select on public.repo_packages for select to authenticated
  using (
    public.is_super_admin()
    or published_by = auth.uid()
    or (status = 'published' and (visibility = 'all' or public.has_iti_access(source_iti_id)))
  );
drop policy if exists repo_delete on public.repo_packages;
create policy repo_delete on public.repo_packages for delete to authenticated using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- 5. FILE STORAGE (photos and attachments)
-- Files live at  media/<trade_id>/<random>.<ext>  and are readable by link;
-- only editors of that trade may add or remove files in its folder.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_obj_select on storage.objects;
create policy media_obj_select on storage.objects for select to authenticated using (bucket_id = 'media');
drop policy if exists media_obj_insert on storage.objects;
create policy media_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_edit_trade(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists media_obj_update on storage.objects;
create policy media_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.can_edit_trade(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists media_obj_delete on storage.objects;
create policy media_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.can_edit_trade(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- 6. FUNCTIONS (called from the app with supabase.rpc)
-- ---------------------------------------------------------------------

-- Everything the app needs to show one trade, in one call
create or replace function public.build_trade_bundle(p_trade uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trade', (select to_jsonb(t) - 'share_token' from trades t where t.id = p_trade),
    'iti',   (select jsonb_build_object('id', i.id, 'name', i.name, 'short_name', i.short_name,
                                        'print_title', i.print_title, 'print_subtitle', i.print_subtitle)
                from itis i join trades t on t.iti_id = i.id where t.id = p_trade),
    'los',     coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.number) from learning_outcomes x where x.trade_id = p_trade), '[]'::jsonb),
    'items',   coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.number) from splitup_items x where x.trade_id = p_trade), '[]'::jsonb),
    'tasks',   coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.number) from tasks x where x.trade_id = p_trade), '[]'::jsonb),
    'media',   coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from media x where x.trade_id = p_trade), '[]'::jsonb),
    'diaries', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.name) from diaries x where x.trade_id = p_trade), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(to_jsonb(x) order by x.week_start, x.day_idx) from diary_entries x where x.trade_id = p_trade), '[]'::jsonb)
  )
$$;

create or replace function public.get_trade_bundle(p_trade_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_read_trade(p_trade_id) then raise exception 'not allowed'; end if;
  return public.build_trade_bundle(p_trade_id);
end $$;

-- Student view: anyone holding the trade's link (no login)
create or replace function public.public_bundle(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_trade uuid;
begin
  select id into v_trade from trades where share_token = p_token and share_enabled;
  if v_trade is null then return null; end if;
  return public.build_trade_bundle(v_trade);
end $$;

-- Snapshot of one learning outcome (used when publishing)
create or replace function public.lo_snapshot(p_lo uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', l.number, 'title', l.title, 'description', l.description, 'sort_order', l.sort_order,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', s.kind, 'number', s.number, 'title', s.title, 'hours', s.hours,
        'content', s.content, 'sort_order', s.sort_order,
        'media', coalesce((select jsonb_agg(jsonb_build_object(
                    'path', m.path, 'file_name', m.file_name, 'mime_type', m.mime_type,
                    'size_bytes', m.size_bytes, 'kind', m.kind, 'sort_order', m.sort_order) order by m.sort_order, m.created_at)
                  from media m where m.item_id = s.id), '[]'::jsonb),
        'tasks', coalesce((select jsonb_agg(jsonb_build_object(
                    'number', k.number, 'name', k.name, 'aim', k.aim, 'procedure', k.procedure,
                    'result', k.result, 'conclusion', k.conclusion, 'sort_order', k.sort_order,
                    'media', coalesce((select jsonb_agg(jsonb_build_object(
                                'path', m2.path, 'file_name', m2.file_name, 'mime_type', m2.mime_type,
                                'size_bytes', m2.size_bytes, 'kind', m2.kind, 'sort_order', m2.sort_order) order by m2.sort_order, m2.created_at)
                              from media m2 where m2.task_id = k.id), '[]'::jsonb)
                  ) order by k.sort_order, k.number)
                  from tasks k where k.item_id = s.id), '[]'::jsonb)
      ) order by s.sort_order, s.number)
      from splitup_items s where s.lo_id = l.id), '[]'::jsonb)
  ) from learning_outcomes l where l.id = p_lo
$$;

-- Publish selected learning outcomes of a trade to the shared repository.
-- Pass p_lineage to publish a NEW VERSION of a package you published before.
create or replace function public.publish_package(
  p_trade uuid, p_lo_ids uuid[], p_title text, p_description text,
  p_visibility text default 'all', p_lineage uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_trade trades; v_iti itis; v_pub profiles;
  v_lineage uuid; v_version int; v_payload jsonb; v_id uuid; v_items int := 0; lo jsonb;
begin
  if auth.uid() is null or not public.can_edit_trade(p_trade) then raise exception 'not allowed'; end if;
  if p_visibility not in ('all','iti') then raise exception 'bad visibility'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'a title is required'; end if;

  select * into v_trade from trades where id = p_trade;
  select * into v_iti   from itis   where id = v_trade.iti_id;
  select * into v_pub   from profiles where id = auth.uid();

  if p_lineage is not null then
    if not exists (select 1 from repo_packages
                    where lineage_id = p_lineage
                      and (published_by = auth.uid() or public.is_iti_admin(source_iti_id))) then
      raise exception 'you cannot add a version to that package';
    end if;
    v_lineage := p_lineage;
    select coalesce(max(version), 0) + 1 into v_version from repo_packages where lineage_id = p_lineage;
  else
    v_lineage := gen_random_uuid(); v_version := 1;
  end if;

  v_payload := jsonb_build_object('los', coalesce((
      select jsonb_agg(public.lo_snapshot(l.id) order by l.sort_order, l.number)
        from learning_outcomes l where l.trade_id = p_trade and l.id = any(p_lo_ids)), '[]'::jsonb));
  if jsonb_array_length(v_payload -> 'los') = 0 then raise exception 'select at least one learning outcome'; end if;
  for lo in select value from jsonb_array_elements(v_payload -> 'los') loop
    v_items := v_items + jsonb_array_length(lo -> 'items');
  end loop;

  insert into repo_packages (lineage_id, version, title, description, trade_name, source_iti_id, source_iti_name,
                             published_by, publisher_name, visibility, lo_count, item_count, payload)
  values (v_lineage, v_version, trim(p_title), coalesce(p_description, ''), v_trade.name, v_iti.id, v_iti.name,
          auth.uid(), coalesce(nullif(v_pub.full_name, ''), v_pub.email), p_visibility,
          jsonb_array_length(v_payload -> 'los'), v_items, v_payload)
  returning id into v_id;
  return v_id;
end $$;

-- Copy a package (or some of its learning outcomes) into a trade you can edit.
-- Runs with YOUR permissions, so the normal access rules apply to every row it creates.
create or replace function public.import_package(
  p_package uuid, p_trade uuid, p_lo_numbers text[] default null, p_conflict text default 'skip'
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  pk repo_packages; lo jsonb; it jsonb; tk jsonb; md jsonb;
  v_lo uuid; v_item uuid; v_task uuid; v_sort int; v_existing uuid;
  v_created text[] := '{}'; v_skipped text[] := '{}'; v_replaced text[] := '{}';
begin
  if not public.can_edit_trade(p_trade) then raise exception 'you cannot edit this trade'; end if;
  select * into pk from repo_packages where id = p_package;
  if not found then raise exception 'package not found'; end if;
  select coalesce(max(sort_order), 0) into v_sort from learning_outcomes where trade_id = p_trade;

  for lo in select value from jsonb_array_elements(pk.payload -> 'los') loop
    if p_lo_numbers is not null and not ((lo ->> 'number') = any(p_lo_numbers)) then continue; end if;
    select id into v_existing from learning_outcomes where trade_id = p_trade and number = lo ->> 'number';
    if v_existing is not null then
      if p_conflict = 'replace' then
        delete from learning_outcomes where id = v_existing;
        v_replaced := v_replaced || (lo ->> 'number');
      else
        v_skipped := v_skipped || (lo ->> 'number');
        continue;
      end if;
    end if;
    v_sort := v_sort + 1;
    insert into learning_outcomes (trade_id, number, title, description, sort_order,
                                   source_package_id, source_lineage_id, source_version)
    values (p_trade, lo ->> 'number', lo ->> 'title', coalesce(lo ->> 'description', ''), v_sort,
            pk.id, pk.lineage_id, pk.version)
    returning id into v_lo;

    for it in select value from jsonb_array_elements(coalesce(lo -> 'items', '[]'::jsonb)) loop
      insert into splitup_items (lo_id, kind, number, title, hours, content, sort_order)
      values (v_lo, it ->> 'kind', it ->> 'number', it ->> 'title', nullif(it ->> 'hours', '')::numeric,
              coalesce(it ->> 'content', ''), coalesce((it ->> 'sort_order')::int, 0))
      returning id into v_item;
      for md in select value from jsonb_array_elements(coalesce(it -> 'media', '[]'::jsonb)) loop
        insert into media (item_id, path, file_name, mime_type, size_bytes, kind, sort_order)
        values (v_item, md ->> 'path', coalesce(md ->> 'file_name', ''), coalesce(md ->> 'mime_type', ''),
                coalesce((md ->> 'size_bytes')::bigint, 0), coalesce(md ->> 'kind', 'photo'),
                coalesce((md ->> 'sort_order')::int, 0));
      end loop;
      for tk in select value from jsonb_array_elements(coalesce(it -> 'tasks', '[]'::jsonb)) loop
        insert into tasks (item_id, number, name, aim, procedure, result, conclusion, sort_order)
        values (v_item, tk ->> 'number', tk ->> 'name', coalesce(tk ->> 'aim', ''), coalesce(tk ->> 'procedure', ''),
                coalesce(tk ->> 'result', ''), coalesce(tk ->> 'conclusion', ''), coalesce((tk ->> 'sort_order')::int, 0))
        returning id into v_task;
        for md in select value from jsonb_array_elements(coalesce(tk -> 'media', '[]'::jsonb)) loop
          insert into media (task_id, path, file_name, mime_type, size_bytes, kind, sort_order)
          values (v_task, md ->> 'path', coalesce(md ->> 'file_name', ''), coalesce(md ->> 'mime_type', ''),
                  coalesce((md ->> 'size_bytes')::bigint, 0), coalesce(md ->> 'kind', 'photo'),
                  coalesce((md ->> 'sort_order')::int, 0));
        end loop;
      end loop;
    end loop;
    v_created := v_created || (lo ->> 'number');
  end loop;

  return jsonb_build_object('created', to_jsonb(v_created), 'skipped', to_jsonb(v_skipped), 'replaced', to_jsonb(v_replaced));
end $$;

-- Withdraw or re-publish a package
create or replace function public.set_package_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare pk repo_packages;
begin
  if p_status not in ('published','withdrawn') then raise exception 'bad status'; end if;
  select * into pk from repo_packages where id = p_id;
  if not found then raise exception 'package not found'; end if;
  if not (pk.published_by = auth.uid() or public.is_super_admin() or public.is_iti_admin(pk.source_iti_id)) then
    raise exception 'not allowed';
  end if;
  update repo_packages set status = p_status where id = p_id;
end $$;

-- Delete a media row. Returns the storage path ONLY when no other row (e.g. a copy
-- made from the repository) still uses that file, so the caller may remove the file.
create or replace function public.delete_media(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m media; v_other int;
begin
  select * into m from media where id = p_id;
  if not found then return null; end if;
  if not public.can_edit_trade(m.trade_id) then raise exception 'not allowed'; end if;
  delete from media where id = p_id;
  select count(*) into v_other from media where path = m.path;
  if v_other = 0 and not exists (
       select 1 from repo_packages where payload::text like '%' || m.path || '%') then
    return m.path;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 7. PRIVILEGES
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant select on public.itis to anon;

revoke execute on function public.build_trade_bundle(uuid)  from public, anon, authenticated;
revoke execute on function public.lo_snapshot(uuid)         from public, anon, authenticated;
revoke execute on function public.admin_sees_user(uuid, uuid) from public, anon;
grant  execute on function public.admin_sees_user(uuid, uuid) to authenticated;
revoke execute on function public.can_read_in_iti(uuid, uuid) from public, anon;
revoke execute on function public.can_edit_in_iti(uuid, uuid) from public, anon;
grant  execute on function public.can_read_in_iti(uuid, uuid) to authenticated;
grant  execute on function public.can_edit_in_iti(uuid, uuid) to authenticated;
revoke execute on function public.get_trade_bundle(uuid)    from public, anon;
revoke execute on function public.publish_package(uuid, uuid[], text, text, text, uuid) from public, anon;
revoke execute on function public.import_package(uuid, uuid, text[], text)              from public, anon;
revoke execute on function public.set_package_status(uuid, text)                        from public, anon;
revoke execute on function public.delete_media(uuid)        from public, anon;
grant  execute on function public.get_trade_bundle(uuid)    to authenticated;
grant  execute on function public.publish_package(uuid, uuid[], text, text, text, uuid) to authenticated;
grant  execute on function public.import_package(uuid, uuid, text[], text)              to authenticated;
grant  execute on function public.set_package_status(uuid, text)                        to authenticated;
grant  execute on function public.delete_media(uuid)        to authenticated;
grant  execute on function public.public_bundle(text)       to anon, authenticated;
