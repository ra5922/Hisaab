-- =====================================================================
-- Hisaab — update 1: invite links, add members later, edit expenses
-- Run ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to run again. Your existing data is kept.
-- (Fresh installs do not need this file: supabase-setup.sql already includes it.)
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
