insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financial-documents',
  'financial-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.budget_item_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  budget_item_id uuid not null references public.budget_items(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  file_name text not null,
  storage_bucket text not null default 'financial-documents',
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  document_type text not null check (document_type in ('receipt', 'invoice', 'quote', 'w9', 'coi', 'contract', 'other')),
  document_status text not null default 'uploaded' check (document_status in ('uploaded', 'needs_review', 'accepted', 'rejected', 'archived')),
  notes text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  delete_reason text,
  restored_at timestamptz,
  restored_by uuid references public.profiles(id) on delete set null
);

create index if not exists budget_item_documents_org_event_idx
  on public.budget_item_documents (organization_id, event_id, uploaded_at desc);

create index if not exists budget_item_documents_budget_item_idx
  on public.budget_item_documents (budget_item_id, deleted_at, uploaded_at desc);

create index if not exists budget_item_documents_uploaded_by_idx
  on public.budget_item_documents (uploaded_by);

create index if not exists budget_item_documents_deleted_by_idx
  on public.budget_item_documents (deleted_by);

create index if not exists budget_item_documents_restored_by_idx
  on public.budget_item_documents (restored_by);

alter table public.budget_item_documents enable row level security;

drop policy if exists "active members can read financial documents" on public.budget_item_documents;
create policy "active members can read financial documents"
on public.budget_item_documents for select
using (app_private.has_active_membership(organization_id));

drop policy if exists "event managers can insert financial documents" on public.budget_item_documents;
create policy "event managers can insert financial documents"
on public.budget_item_documents for insert
with check (
  app_private.can_manage_events(organization_id)
  and uploaded_by = auth.uid()
);

drop policy if exists "event managers can update financial document status" on public.budget_item_documents;
create policy "event managers can update financial document status"
on public.budget_item_documents for update
using (app_private.can_manage_events(organization_id))
with check (app_private.can_manage_events(organization_id));

revoke all on public.budget_item_documents from anon;
revoke all on public.budget_item_documents from authenticated;
grant select, insert, update on public.budget_item_documents to authenticated;
grant select, insert, update, delete on public.budget_item_documents to service_role;

create or replace function app_private.enforce_financial_document_archive_permission()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if (
    old.deleted_at is distinct from new.deleted_at
    or old.deleted_by is distinct from new.deleted_by
    or old.delete_reason is distinct from new.delete_reason
    or old.restored_at is distinct from new.restored_at
    or old.restored_by is distinct from new.restored_by
    or (old.document_status is distinct from new.document_status and (old.document_status = 'archived' or new.document_status = 'archived'))
  ) and not app_private.can_delete_records(new.organization_id) then
    raise exception 'Only Admins and Owners can archive or restore financial documents.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_budget_item_documents_archive_permission on public.budget_item_documents;
create trigger enforce_budget_item_documents_archive_permission
before update on public.budget_item_documents
for each row execute function app_private.enforce_financial_document_archive_permission();

drop policy if exists "active members can read financial document files" on storage.objects;
create policy "active members can read financial document files"
on storage.objects for select
using (
  bucket_id = 'financial-documents'
  and app_private.has_active_membership(split_part(name, '/', 1)::uuid)
);

drop policy if exists "event managers can upload financial document files" on storage.objects;
create policy "event managers can upload financial document files"
on storage.objects for insert
with check (
  bucket_id = 'financial-documents'
  and app_private.can_manage_events(split_part(name, '/', 1)::uuid)
);

drop policy if exists "event managers can update financial document files" on storage.objects;
create policy "event managers can update financial document files"
on storage.objects for update
using (
  bucket_id = 'financial-documents'
  and app_private.can_manage_events(split_part(name, '/', 1)::uuid)
)
with check (
  bucket_id = 'financial-documents'
  and app_private.can_manage_events(split_part(name, '/', 1)::uuid)
);

drop policy if exists "owners and admins can delete financial document files" on storage.objects;
create policy "owners and admins can delete financial document files"
on storage.objects for delete
using (
  bucket_id = 'financial-documents'
  and app_private.can_delete_records(split_part(name, '/', 1)::uuid)
);
