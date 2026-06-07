create or replace function app_private.enforce_archive_metadata_permission()
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
  ) and not app_private.can_delete_records(new.organization_id) then
    raise exception 'Only Admins and Owners can archive or restore records.';
  end if;

  return new;
end;
$$;
