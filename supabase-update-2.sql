-- =====================================================================
-- Hisaab - update 2: fixes "Could not create group" / invite link problems
-- Run this ONCE in Supabase -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run again. It does not delete anything.
-- =====================================================================

-- 1) Every signed-up account must have a row in "profiles" (groups point at it).
--    This adds a profile for any account that is missing one.
insert into public.profiles (id, name, email, avatar_color)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1)),
       lower(u.email),
       '#fcbf2e'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;

-- 2) Make sure new accounts always get a profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  colors text[] := array['#fcbf2e','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6'];
begin
  insert into public.profiles (id, name, email, avatar_color)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    colors[1 + floor(random() * array_length(colors, 1))::int]
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) create_group and join_group now create the caller's profile if it is somehow missing.
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

  insert into profiles (id, name, email)
  select u.id, coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1)), lower(u.email)
  from auth.users u where u.id = v_uid
  on conflict do nothing;

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

  insert into profiles (id, name, email)
  select u.id, coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1)), lower(u.email)
  from auth.users u where u.id = auth.uid()
  on conflict do nothing;

  select id into v_gid from groups where invite_code = trim(p_code);
  if v_gid is null then raise exception 'This invite link is not valid any more'; end if;
  insert into group_members (group_id, user_id) values (v_gid, auth.uid()) on conflict do nothing;
  return v_gid;
end;
$$;

grant execute on function public.create_group(text, text, text[]), public.join_group(text) to authenticated;
