create table if not exists public.invite_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  full_name text not null,
  email text not null,
  company text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'invited', 'declined', 'spam')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  notes text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists invite_requests_status_created_idx
  on public.invite_requests (status, created_at desc);

create index if not exists invite_requests_email_status_idx
  on public.invite_requests (lower(email), status);

create index if not exists invite_requests_organization_status_idx
  on public.invite_requests (organization_id, status, created_at desc);

alter table public.invite_requests enable row level security;

drop policy if exists "owners and admins can read invite requests" on public.invite_requests;
create policy "owners and admins can read invite requests"
on public.invite_requests for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.profile_id = auth.uid()
      and member.status = 'active'
      and member.role in ('owner', 'admin')
      and (
        public.invite_requests.organization_id is null
        or member.organization_id = public.invite_requests.organization_id
      )
  )
);

drop policy if exists "owners and admins can update invite requests" on public.invite_requests;
create policy "owners and admins can update invite requests"
on public.invite_requests for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.profile_id = auth.uid()
      and member.status = 'active'
      and member.role in ('owner', 'admin')
      and (
        public.invite_requests.organization_id is null
        or member.organization_id = public.invite_requests.organization_id
      )
  )
)
with check (
  exists (
    select 1
    from public.organization_members member
    where member.profile_id = auth.uid()
      and member.status = 'active'
      and member.role in ('owner', 'admin')
      and (
        public.invite_requests.organization_id is null
        or member.organization_id = public.invite_requests.organization_id
      )
  )
);

revoke all on public.invite_requests from anon;
revoke all on public.invite_requests from authenticated;
grant select, update on public.invite_requests to authenticated;
grant select, insert, update, delete on public.invite_requests to service_role;
