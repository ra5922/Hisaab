-- =====================================================================
-- Hisaab — Supabase setup
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- It is safe to run again: nothing is dropped and existing data is kept.
-- =====================================================================

-- ---------- Tables ----------

-- One row per person. Supabase Auth keeps the password; we keep the profile.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  avatar_color text default '#6366f1',
  created_at timestamptz default now()
);
create unique index if not exists profiles_email_key on public.profiles (lower(email));

create table if not exists public.groups (
  id bigint generated always as identity primary key,
  name text not null,
  category text default 'general',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.group_members (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  unique (group_id, user_id)
);

create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(id) on delete cascade,
  paid_by uuid not null references public.profiles(id),
  amount numeric(10,2) not null check (amount > 0),
  description text not null,
  category text default 'general',
  discount numeric(10,2) default 0 check (discount >= 0),
  notes text,
  split_type text default 'equal' check (split_type in ('equal', 'custom')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.splits (
  id bigint generated always as identity primary key,
  expense_id bigint not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount_owed numeric(10,2) not null check (amount_owed >= 0),
  is_settled boolean default false,
  settled_at timestamptz
);

create table if not exists public.settlements (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(id) on delete cascade,
  from_user uuid not null references public.profiles(id),
  to_user uuid not null references public.profiles(id),
  amount numeric(10,2) not null check (amount > 0),
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_group_members_user on public.group_members (user_id);
create index if not exists idx_group_members_group on public.group_members (group_id);
create index if not exists idx_expenses_group on public.expenses (group_id);
create index if not exists idx_splits_expense on public.splits (expense_id);
create index if not exists idx_settlements_group on public.settlements (group_id);

-- ---------- Create a profile automatically when someone signs up ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  colors text[] := array['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6'];
begin
  insert into public.profiles (id, name, email, avatar_color)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    colors[1 + floor(random() * array_length(colors, 1))::int]
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Helper functions used by the security rules ----------

create or replace function public.is_group_member(p_group_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.shares_group_with(p_user uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

create or replace function public.is_expense_member(p_expense_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.expenses e
    join public.group_members gm on gm.group_id = e.group_id
    where e.id = p_expense_id and gm.user_id = auth.uid()
  );
$$;

-- ---------- Row Level Security: who can see / change what ----------

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses      enable row level security;
alter table public.splits        enable row level security;
alter table public.settlements   enable row level security;

drop policy if exists "profiles: see yourself and people you share a group with" on public.profiles;
create policy "profiles: see yourself and people you share a group with"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

drop policy if exists "profiles: edit your own" on public.profiles;
create policy "profiles: edit your own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "groups: members can see" on public.groups;
create policy "groups: members can see"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

drop policy if exists "groups: only the creator can delete" on public.groups;
create policy "groups: only the creator can delete"
  on public.groups for delete to authenticated
  using (created_by = auth.uid());

drop policy if exists "group_members: members can see" on public.group_members;
create policy "group_members: members can see"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "expenses: members can see" on public.expenses;
create policy "expenses: members can see"
  on public.expenses for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "expenses: members can delete" on public.expenses;
create policy "expenses: members can delete"
  on public.expenses for delete to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "splits: members can see" on public.splits;
create policy "splits: members can see"
  on public.splits for select to authenticated
  using (public.is_expense_member(expense_id));

drop policy if exists "settlements: members can see" on public.settlements;
create policy "settlements: members can see"
  on public.settlements for select to authenticated
  using (public.is_group_member(group_id));

-- Table permissions: read everywhere, delete only where a policy allows it.
-- All other writes go through the functions below.
revoke all on public.profiles, public.groups, public.group_members,
              public.expenses, public.splits, public.settlements from anon;
revoke insert, update, delete, truncate on public.profiles, public.groups, public.group_members,
              public.expenses, public.splits, public.settlements from authenticated;
grant select on public.profiles, public.groups, public.group_members,
              public.expenses, public.splits, public.settlements to authenticated;
grant delete on public.expenses, public.groups to authenticated;
grant update (name, avatar_color) on public.profiles to authenticated;

-- ---------- Functions the app calls ----------

-- List of the signed-in user's groups with counts and totals.
-- (Runs with the caller's permissions, so security rules limit it to their groups.)
create or replace function public.my_groups()
returns table (
  id bigint, name text, category text, created_by uuid, created_at timestamptz,
  member_count bigint, expense_count bigint, total_spent numeric
)
language sql stable
as $$
  select g.id, g.name, g.category, g.created_by, g.created_at,
    (select count(*) from public.group_members gm where gm.group_id = g.id),
    (select count(*) from public.expenses e where e.group_id = g.id),
    (select coalesce(sum(e.amount - e.discount), 0) from public.expenses e where e.group_id = g.id)
  from public.groups g
  order by g.created_at desc;
$$;

-- Create a group, add yourself, and add people by email (they must have signed up).
create or replace function public.create_group(p_name text, p_category text, p_member_emails text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_gid bigint;
  v_missing text[] := '{}';
  v_email text;
  v_member uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Group name is required'; end if;

  insert into groups (name, category, created_by)
  values (trim(p_name), coalesce(nullif(p_category, ''), 'general'), v_uid)
  returning id into v_gid;

  insert into group_members (group_id, user_id) values (v_gid, v_uid);

  foreach v_email in array coalesce(p_member_emails, '{}') loop
    v_member := null;
    select id into v_member from profiles where lower(email) = lower(trim(v_email));
    if v_member is null then
      v_missing := v_missing || trim(v_email);
    elsif v_member <> v_uid then
      insert into group_members (group_id, user_id) values (v_gid, v_member) on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('group_id', v_gid, 'missing', to_jsonb(v_missing));
end;
$$;

-- Add an expense and its splits in one step (all or nothing).
-- p_splits looks like: [{"user_id": "...", "amount": 180.5}, ...]
create or replace function public.add_expense(
  p_group_id bigint, p_paid_by uuid, p_amount numeric, p_description text, p_category text,
  p_discount numeric, p_notes text, p_split_type text, p_splits jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_eid bigint;
  v_row jsonb;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'Access denied'; end if;
  if not exists (select 1 from group_members where group_id = p_group_id and user_id = p_paid_by) then
    raise exception 'The payer is not in this group';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then raise exception 'Description is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount - coalesce(p_discount, 0) <= 0 or coalesce(p_discount, 0) < 0 then
    raise exception 'Effective amount after discount must be positive';
  end if;
  if p_split_type not in ('equal', 'custom') then raise exception 'Invalid split type'; end if;
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'At least one split is required';
  end if;

  insert into expenses (group_id, paid_by, amount, description, category, discount, notes, split_type, created_by)
  values (p_group_id, p_paid_by, p_amount, trim(p_description), coalesce(nullif(p_category, ''), 'general'),
          coalesce(p_discount, 0), nullif(p_notes, ''), p_split_type, v_uid)
  returning id into v_eid;

  for v_row in select value from jsonb_array_elements(p_splits) loop
    if not exists (
      select 1 from group_members
      where group_id = p_group_id and user_id = (v_row->>'user_id')::uuid
    ) then
      raise exception 'A split member is not in this group';
    end if;
    insert into splits (expense_id, user_id, amount_owed)
    values (v_eid, (v_row->>'user_id')::uuid, (v_row->>'amount')::numeric);
  end loop;

  return v_eid;
end;
$$;

-- Record that you paid someone, and mark your splits for their expenses as settled.
create or replace function public.settle_up(p_group_id bigint, p_to_user uuid, p_amount numeric, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'Access denied'; end if;
  if p_to_user = v_uid then raise exception 'You cannot pay yourself'; end if;
  if not exists (select 1 from group_members where group_id = p_group_id and user_id = p_to_user) then
    raise exception 'That person is not in this group';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  insert into settlements (group_id, from_user, to_user, amount, note)
  values (p_group_id, v_uid, p_to_user, p_amount, nullif(p_note, ''));

  update splits set is_settled = true, settled_at = now()
  where user_id = v_uid and is_settled = false
    and expense_id in (select id from expenses where group_id = p_group_id and paid_by = p_to_user);
end;
$$;

-- Only signed-in users may call these.
revoke all on function public.is_group_member(bigint), public.shares_group_with(uuid),
  public.is_expense_member(bigint), public.my_groups(),
  public.create_group(text, text, text[]),
  public.add_expense(bigint, uuid, numeric, text, text, numeric, text, text, jsonb),
  public.settle_up(bigint, uuid, numeric, text)
  from public, anon;
grant execute on function public.is_group_member(bigint), public.shares_group_with(uuid),
  public.is_expense_member(bigint), public.my_groups(),
  public.create_group(text, text, text[]),
  public.add_expense(bigint, uuid, numeric, text, text, numeric, text, text, jsonb),
  public.settle_up(bigint, uuid, numeric, text)
  to authenticated;

-- =====================================================================
-- Update 1: invite links, add members later, edit expenses
-- =====================================================================

-- ---------- Invite code for every group ----------

alter table public.groups add column if not exists invite_code text;

update public.groups
   set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
 where invite_code is null;

alter table public.groups
  alter column invite_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
alter table public.groups alter column invite_code set not null;

create unique index if not exists groups_invite_code_key on public.groups (invite_code);

-- ---------- Add people to a group you are already in (by email) ----------
-- Returns {"added": 2, "already": ["a@x.com"], "missing": ["b@x.com"]}
-- "missing" = nobody has signed up with that email yet.

create or replace function public.add_members(p_group_id bigint, p_emails text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_member uuid;
  v_added int := 0;
  v_already text[] := '{}';
  v_missing text[] := '{}';
  v_rows int;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'Access denied'; end if;

  foreach v_email in array coalesce(p_emails, '{}') loop
    v_email := lower(trim(v_email));
    continue when v_email = '';
    v_member := null;
    select id into v_member from profiles where lower(email) = v_email;
    if v_member is null then
      v_missing := v_missing || v_email;
    else
      insert into group_members (group_id, user_id) values (p_group_id, v_member)
      on conflict do nothing;
      get diagnostics v_rows = row_count;
      if v_rows = 1 then v_added := v_added + 1; else v_already := v_already || v_email; end if;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'already', to_jsonb(v_already), 'missing', to_jsonb(v_missing));
end;
$$;

-- ---------- Invite links ----------

-- What the "join" page shows before the person agrees to join.
create or replace function public.invite_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g groups%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into g from groups where invite_code = trim(p_code);
  if not found then return null; end if;
  return jsonb_build_object(
    'group_id', g.id,
    'name', g.name,
    'category', g.category,
    'member_count', (select count(*) from group_members where group_id = g.id),
    'already_member', exists (select 1 from group_members where group_id = g.id and user_id = auth.uid())
  );
end;
$$;

-- Join a group using its invite code. Returns the group id.
create or replace function public.join_group(p_code text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gid bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into v_gid from groups where invite_code = trim(p_code);
  if v_gid is null then raise exception 'This invite link is not valid any more'; end if;
  insert into group_members (group_id, user_id) values (v_gid, auth.uid()) on conflict do nothing;
  return v_gid;
end;
$$;

-- Make a new invite code (the old link stops working). Group creator only.
create or replace function public.reset_invite_code(p_group_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  v_rows int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update groups set invite_code = v_code where id = p_group_id and created_by = auth.uid();
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Only the group creator can do this'; end if;
  return v_code;
end;
$$;

-- ---------- Edit an expense ----------
-- Only the person who added it, or who paid for it, can change it.
-- Splits are replaced (people who were already marked settled stay settled).

create or replace function public.update_expense(
  p_expense_id bigint, p_paid_by uuid, p_amount numeric, p_description text, p_category text,
  p_discount numeric, p_notes text, p_split_type text, p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e expenses%rowtype;
  v_row jsonb;
  v_user uuid;
  v_rows int;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select * into e from expenses where id = p_expense_id;
  if not found then raise exception 'Expense not found'; end if;
  if not public.is_group_member(e.group_id) then raise exception 'Access denied'; end if;
  if e.paid_by <> v_uid and e.created_by is distinct from v_uid then
    raise exception 'Only the person who added or paid for this expense can edit it';
  end if;

  if not exists (select 1 from group_members where group_id = e.group_id and user_id = p_paid_by) then
    raise exception 'The payer is not in this group';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then raise exception 'Description is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount - coalesce(p_discount, 0) <= 0 or coalesce(p_discount, 0) < 0 then
    raise exception 'Effective amount after discount must be positive';
  end if;
  if p_split_type not in ('equal', 'custom') then raise exception 'Invalid split type'; end if;
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'At least one split is required';
  end if;
  if (select count(distinct value->>'user_id') from jsonb_array_elements(p_splits)) <> jsonb_array_length(p_splits) then
    raise exception 'Each person can only appear once in the split';
  end if;

  update expenses
     set paid_by = p_paid_by, amount = p_amount, description = trim(p_description),
         category = coalesce(nullif(p_category, ''), 'general'), discount = coalesce(p_discount, 0),
         notes = nullif(p_notes, ''), split_type = p_split_type
   where id = p_expense_id;

  for v_row in select value from jsonb_array_elements(p_splits) loop
    v_user := (v_row->>'user_id')::uuid;
    if not exists (select 1 from group_members where group_id = e.group_id and user_id = v_user) then
      raise exception 'A split member is not in this group';
    end if;
    update splits set amount_owed = (v_row->>'amount')::numeric
     where expense_id = p_expense_id and user_id = v_user;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      insert into splits (expense_id, user_id, amount_owed)
      values (p_expense_id, v_user, (v_row->>'amount')::numeric);
    end if;
  end loop;

  delete from splits
   where expense_id = p_expense_id
     and user_id not in (select (value->>'user_id')::uuid from jsonb_array_elements(p_splits));
end;
$$;

-- Only signed-in users may call these.
revoke all on function public.add_members(bigint, text[]), public.invite_preview(text),
  public.join_group(text), public.reset_invite_code(bigint),
  public.update_expense(bigint, uuid, numeric, text, text, numeric, text, text, jsonb)
  from public, anon;
grant execute on function public.add_members(bigint, text[]), public.invite_preview(text),
  public.join_group(text), public.reset_invite_code(bigint),
  public.update_expense(bigint, uuid, numeric, text, text, numeric, text, text, jsonb)
  to authenticated;
