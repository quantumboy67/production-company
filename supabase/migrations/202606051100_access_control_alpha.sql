do $$
begin
  create type public.organization_member_role as enum ('owner', 'admin', 'producer', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.organization_member_status as enum ('active', 'removed', 'disabled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_member_role not null default 'viewer',
  status public.organization_member_status not null default 'active',
  must_change_password boolean not null default false,
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

alter table public.profiles
  add column if not exists email text;

create index if not exists organization_members_profile_status_idx
  on public.organization_members (profile_id, status);
create index if not exists organization_members_org_role_status_idx
  on public.organization_members (organization_id, role, status);

drop trigger if exists touch_organization_members_updated_at on public.organization_members;
create trigger touch_organization_members_updated_at
before update on public.organization_members
for each row execute function public.touch_updated_at();

insert into public.organization_members (
  organization_id,
  profile_id,
  role,
  status,
  must_change_password,
  invited_at
)
select
  profiles.organization_id,
  profiles.id,
  'owner'::public.organization_member_role,
  'active'::public.organization_member_status,
  false,
  now()
from public.profiles
where profiles.organization_id is not null
on conflict (organization_id, profile_id) do update set
  role = case
    when public.organization_members.role = 'owner'::public.organization_member_role then public.organization_members.role
    else excluded.role
  end,
  status = 'active'::public.organization_member_status,
  must_change_password = false,
  updated_at = now();

create or replace function app_private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_members.organization_id
  from public.organization_members
  where organization_members.profile_id = auth.uid()
    and organization_members.status = 'active'::public.organization_member_status
  order by organization_members.created_at
  limit 1
$$;

create or replace function app_private.has_active_membership(organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = has_active_membership.organization_id
      and organization_members.profile_id = auth.uid()
      and organization_members.status = 'active'::public.organization_member_status
  )
$$;

create or replace function app_private.current_membership_role(organization_id uuid)
returns public.organization_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select organization_members.role
  from public.organization_members
  where organization_members.organization_id = current_membership_role.organization_id
    and organization_members.profile_id = auth.uid()
    and organization_members.status = 'active'::public.organization_member_status
  limit 1
$$;

create or replace function app_private.can_manage_users(organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app_private.current_membership_role(organization_id) in (
    'owner'::public.organization_member_role,
    'admin'::public.organization_member_role
  ), false)
$$;

create or replace function app_private.can_manage_events(organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app_private.current_membership_role(organization_id) in (
    'owner'::public.organization_member_role,
    'admin'::public.organization_member_role,
    'producer'::public.organization_member_role
  ), false)
$$;

create or replace function app_private.can_edit_financials(organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.can_manage_events(organization_id)
$$;

create or replace function app_private.can_delete_records(organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app_private.current_membership_role(organization_id) in (
    'owner'::public.organization_member_role,
    'admin'::public.organization_member_role
  ), false)
$$;

grant execute on function app_private.current_organization_id() to authenticated;
grant execute on function app_private.has_active_membership(uuid) to authenticated;
grant execute on function app_private.current_membership_role(uuid) to authenticated;
grant execute on function app_private.can_manage_users(uuid) to authenticated;
grant execute on function app_private.can_manage_events(uuid) to authenticated;
grant execute on function app_private.can_edit_financials(uuid) to authenticated;
grant execute on function app_private.can_delete_records(uuid) to authenticated;

alter table public.organization_members enable row level security;

drop policy if exists "members can read organization members" on public.organization_members;
create policy "members can read organization members"
on public.organization_members for select
using (
  profile_id = auth.uid()
  or app_private.has_active_membership(organization_id)
);

drop policy if exists "admins can insert organization members" on public.organization_members;
create policy "admins can insert organization members"
on public.organization_members for insert
with check (app_private.can_manage_users(organization_id));

drop policy if exists "admins can update organization members" on public.organization_members;
create policy "admins can update organization members"
on public.organization_members for update
using (app_private.can_manage_users(organization_id))
with check (app_private.can_manage_users(organization_id));

drop policy if exists "members can read their organization" on public.organizations;
create policy "members can read their organization"
on public.organizations for select
using (app_private.has_active_membership(id));

drop policy if exists "members can update their organization" on public.organizations;
create policy "owners and admins can update their organization"
on public.organizations for update
using (app_private.can_manage_users(id))
with check (app_private.can_manage_users(id));

drop policy if exists "profiles can read organization profiles" on public.profiles;
create policy "profiles can read organization profiles"
on public.profiles for select
using (
  id = auth.uid()
  or app_private.has_active_membership(organization_id)
);

drop policy if exists "profiles can be inserted by owner" on public.profiles;
create policy "profiles can be inserted by owner"
on public.profiles for insert
with check (
  id = auth.uid()
  or exists (
    select 1
    from public.organizations
    where organizations.id = profiles.organization_id
      and organizations.created_by = auth.uid()
  )
  or app_private.can_manage_users(organization_id)
);

drop policy if exists "profiles can update self" on public.profiles;
create policy "profiles can update self or admins can update org profiles"
on public.profiles for update
using (
  id = auth.uid()
  or app_private.can_manage_users(organization_id)
)
with check (
  id = auth.uid()
  or app_private.can_manage_users(organization_id)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'venues', 'contacts', 'event_contacts', 'files',
    'contracts', 'sponsorships', 'tasks', 'run_of_show_items'
  ]
  loop
    execute format('drop policy if exists "members can read org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can insert org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can update org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can delete org rows" on public.%I', table_name);

    execute format('create policy "active members can read org rows" on public.%I for select using (app_private.has_active_membership(organization_id))', table_name);
    execute format('create policy "producers can insert org rows" on public.%I for insert with check (app_private.can_manage_events(organization_id))', table_name);
    execute format('create policy "producers can update org rows" on public.%I for update using (app_private.can_manage_events(organization_id)) with check (app_private.can_manage_events(organization_id))', table_name);
    execute format('create policy "admins can delete org rows" on public.%I for delete using (app_private.can_delete_records(organization_id))', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['events']
  loop
    execute format('drop policy if exists "members can read org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can insert org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can update org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can delete org rows" on public.%I', table_name);

    execute format('create policy "active members can read events" on public.%I for select using (app_private.has_active_membership(organization_id))', table_name);
    execute format('create policy "producers can insert events" on public.%I for insert with check (app_private.can_manage_events(organization_id))', table_name);
    execute format('create policy "producers can update events" on public.%I for update using (app_private.can_manage_events(organization_id)) with check (app_private.can_manage_events(organization_id))', table_name);
    execute format('create policy "admins can delete events" on public.%I for delete using (app_private.can_delete_records(organization_id))', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'budget_items', 'revenue_items', 'ticket_tiers', 'settlements'
  ]
  loop
    execute format('drop policy if exists "members can read org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can insert org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can update org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can delete org rows" on public.%I', table_name);

    execute format('create policy "active members can read financial rows" on public.%I for select using (app_private.has_active_membership(organization_id))', table_name);
    execute format('create policy "producers can insert financial rows" on public.%I for insert with check (app_private.can_edit_financials(organization_id))', table_name);
    execute format('create policy "producers can update financial rows" on public.%I for update using (app_private.can_edit_financials(organization_id)) with check (app_private.can_edit_financials(organization_id))', table_name);
    execute format('create policy "admins can delete financial rows" on public.%I for delete using (app_private.can_delete_records(organization_id))', table_name);
  end loop;
end $$;

drop policy if exists "members can read private event files" on storage.objects;
create policy "active members can read private event files"
on storage.objects for select to authenticated
using (
  bucket_id = 'event-documents'
  and app_private.has_active_membership(split_part(name, '/', 1)::uuid)
);

drop policy if exists "members can upload private event files" on storage.objects;
create policy "producers can upload private event files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-documents'
  and app_private.can_edit_financials(split_part(name, '/', 1)::uuid)
);

drop policy if exists "members can update private event files" on storage.objects;
create policy "producers can update private event files"
on storage.objects for update to authenticated
using (
  bucket_id = 'event-documents'
  and app_private.can_edit_financials(split_part(name, '/', 1)::uuid)
)
with check (
  bucket_id = 'event-documents'
  and app_private.can_edit_financials(split_part(name, '/', 1)::uuid)
);

drop policy if exists "members can delete private event files" on storage.objects;
create policy "admins can delete private event files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'event-documents'
  and app_private.can_delete_records(split_part(name, '/', 1)::uuid)
);

grant select, insert, update on public.organization_members to authenticated;
