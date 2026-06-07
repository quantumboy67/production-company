alter table public.events
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references public.profiles(id) on delete set null;

alter table public.budget_items
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references public.profiles(id) on delete set null;

alter table public.revenue_items
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references public.profiles(id) on delete set null;

alter table public.ticket_tiers
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references public.profiles(id) on delete set null;

create index if not exists events_active_org_starts_on_idx
  on public.events (organization_id, starts_on)
  where deleted_at is null;

create index if not exists budget_items_active_event_idx
  on public.budget_items (organization_id, event_id, cost_type, category)
  where deleted_at is null;

create index if not exists revenue_items_active_event_idx
  on public.revenue_items (organization_id, event_id, source)
  where deleted_at is null;

create index if not exists ticket_tiers_active_event_idx
  on public.ticket_tiers (organization_id, event_id, price)
  where deleted_at is null;

drop policy if exists "admins can delete events" on public.events;
drop policy if exists "admins can delete financial rows" on public.budget_items;
drop policy if exists "admins can delete financial rows" on public.revenue_items;
drop policy if exists "admins can delete financial rows" on public.ticket_tiers;

create or replace function app_private.enforce_archive_metadata_permission()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if (
    old.deleted_at is distinct from new.deleted_at
    or old.deleted_by is distinct from new.deleted_by
    or old.delete_reason is distinct from new.delete_reason
    or old.restored_at is distinct from new.restored_at
    or old.restored_by is distinct from new.restored_by
  ) and not app_private.can_delete_records(new.organization_id) then
    raise exception 'Only Admins and Owners can archive or restore records.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_events_archive_metadata_permission on public.events;
create trigger enforce_events_archive_metadata_permission
before update on public.events
for each row execute function app_private.enforce_archive_metadata_permission();

drop trigger if exists enforce_budget_items_archive_metadata_permission on public.budget_items;
create trigger enforce_budget_items_archive_metadata_permission
before update on public.budget_items
for each row execute function app_private.enforce_archive_metadata_permission();

drop trigger if exists enforce_revenue_items_archive_metadata_permission on public.revenue_items;
create trigger enforce_revenue_items_archive_metadata_permission
before update on public.revenue_items
for each row execute function app_private.enforce_archive_metadata_permission();

drop trigger if exists enforce_ticket_tiers_archive_metadata_permission on public.ticket_tiers;
create trigger enforce_ticket_tiers_archive_metadata_permission
before update on public.ticket_tiers
for each row execute function app_private.enforce_archive_metadata_permission();
