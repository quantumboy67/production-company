create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_name text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_org_created_idx
  on public.audit_log (organization_id, created_at desc);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);

create index if not exists audit_log_actor_profile_idx
  on public.audit_log (actor_profile_id);

create index if not exists audit_log_action_idx
  on public.audit_log (action);

alter table public.audit_log enable row level security;

drop policy if exists "active members can read audit logs" on public.audit_log;
create policy "active members can read audit logs"
on public.audit_log for select
using (app_private.has_active_membership(organization_id));

revoke all on public.audit_log from anon;
revoke all on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;
grant select, insert on public.audit_log to service_role;
