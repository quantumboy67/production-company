create table if not exists public.auth_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  email text,
  event_type text not null,
  summary text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_activity_org_created_idx
  on public.auth_activity (organization_id, created_at desc);

create index if not exists auth_activity_profile_created_idx
  on public.auth_activity (profile_id, created_at desc);

create index if not exists auth_activity_auth_user_created_idx
  on public.auth_activity (auth_user_id, created_at desc);

create index if not exists auth_activity_event_type_idx
  on public.auth_activity (event_type);

alter table public.auth_activity enable row level security;

drop policy if exists "owners and admins can read auth activity" on public.auth_activity;
create policy "owners and admins can read auth activity"
on public.auth_activity for select
using (app_private.can_manage_users(organization_id));

revoke all on public.auth_activity from anon;
revoke all on public.auth_activity from authenticated;
grant select on public.auth_activity to authenticated;
grant select, insert on public.auth_activity to service_role;
