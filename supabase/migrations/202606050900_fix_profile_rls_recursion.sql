create schema if not exists app_private;

create or replace function app_private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.organization_id
  from public.profiles
  where profiles.id = auth.uid()
$$;

grant usage on schema app_private to authenticated;
grant execute on function app_private.current_organization_id() to authenticated;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select app_private.current_organization_id()
$$;

drop policy if exists "members can read their organization" on public.organizations;
create policy "members can read their organization"
on public.organizations for select
using (id = app_private.current_organization_id() or created_by = auth.uid());

drop policy if exists "members can update their organization" on public.organizations;
create policy "members can update their organization"
on public.organizations for update
using (id = app_private.current_organization_id() or created_by = auth.uid())
with check (id = app_private.current_organization_id() or created_by = auth.uid());

drop policy if exists "profiles can read organization profiles" on public.profiles;
create policy "profiles can read organization profiles"
on public.profiles for select
using (organization_id = app_private.current_organization_id() or id = auth.uid());

drop policy if exists "profiles can update self" on public.profiles;
create policy "profiles can update self"
on public.profiles for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and (
    organization_id = app_private.current_organization_id()
    or exists (
      select 1
      from public.organizations
      where organizations.id = profiles.organization_id
        and organizations.created_by = auth.uid()
    )
  )
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'venues', 'contacts', 'events', 'event_contacts', 'files',
    'budget_items', 'revenue_items', 'ticket_tiers', 'settlements',
    'contracts', 'sponsorships', 'tasks', 'run_of_show_items'
  ]
  loop
    execute format('drop policy if exists "members can read org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can insert org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can update org rows" on public.%I', table_name);
    execute format('drop policy if exists "members can delete org rows" on public.%I', table_name);

    execute format('create policy "members can read org rows" on public.%I for select using (organization_id = app_private.current_organization_id())', table_name);
    execute format('create policy "members can insert org rows" on public.%I for insert with check (organization_id = app_private.current_organization_id())', table_name);
    execute format('create policy "members can update org rows" on public.%I for update using (organization_id = app_private.current_organization_id()) with check (organization_id = app_private.current_organization_id())', table_name);
    execute format('create policy "members can delete org rows" on public.%I for delete using (organization_id = app_private.current_organization_id())', table_name);
  end loop;
end $$;

drop policy if exists "members can read private event files" on storage.objects;
create policy "members can read private event files"
on storage.objects for select to authenticated
using (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
);

drop policy if exists "members can upload private event files" on storage.objects;
create policy "members can upload private event files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
);

drop policy if exists "members can update private event files" on storage.objects;
create policy "members can update private event files"
on storage.objects for update to authenticated
using (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
)
with check (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
);

drop policy if exists "members can delete private event files" on storage.objects;
create policy "members can delete private event files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
);
