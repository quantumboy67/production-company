# Juniper Berry Production Company Deployment Checklist

## Supabase

- [ ] Create Supabase project.
- [ ] Enable Email/Password auth.
- [ ] Apply all migrations in `supabase/migrations` in order, including Access Control Alpha and Audit Trail Alpha.
- [ ] Confirm `public.audit_log` exists and RLS is enabled.
- [ ] Confirm authenticated users can select only active-organization audit rows and cannot directly insert/update/delete audit rows.
- [ ] Confirm RLS is enabled on all public app tables.
- [ ] Confirm existing onboarded users were backfilled into `organization_members` as active Owners.
- [ ] Confirm private Storage bucket `event-documents` exists.
- [ ] Create the first Auth user.
- [ ] Sign in and complete `/onboarding` to create the first organization/profile.
- [ ] Confirm onboarding also creates the scoped `Cedric Burnside @ Fairweather` demo event.
- [ ] Confirm the user can reach `/dashboard`.
- [ ] Optional: generate TypeScript database types with `npm run types:supabase`.

## Environment Variables

- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` locally in `.env.local`.
- [ ] Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` locally in `.env.local`.
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` locally in `.env.local` for server-only invite/user management.
- [ ] Confirm the service role key is never prefixed with `NEXT_PUBLIC_`.
- [ ] Confirm no service role key appears in browser/client code or logs.
- [ ] Set the same public Supabase variables in Vercel Project Settings.
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel Project Settings for Preview/Production before testing Team invites.

## Vercel

- [ ] Push repo to GitHub.
- [ ] Import repo into Vercel.
- [ ] Confirm build command is `npm run build`.
- [ ] Confirm install command is `npm install`.
- [ ] Deploy preview.
- [ ] If beta testers should access the deployment directly, disable Vercel Deployment Protection for the beta environment or distribute an approved Vercel share/bypass link.
- [ ] Smoke test preview URL.
- [ ] In the deployed app, make one event or budget change and confirm the event `Activity` tab shows the audit row.
- [ ] Promote to production when preview is clean.

## Preflight Commands

```bash
npm run lint
npm run build
```

## Manual Supabase SQL Fallback

```sql
with org as (
  select id from public.organizations where slug = 'juniper-berry-production-company'
),
profile as (
  insert into public.profiles (id, organization_id, full_name, email, role)
  select 'AUTH_USER_ID_HERE', id, 'Your Name', 'you@example.com', 'owner'
  from org
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role
  returning id, organization_id
)
insert into public.organization_members (organization_id, profile_id, role, status, must_change_password, invited_at)
select organization_id, id, 'owner', 'active', false, now()
from profile
on conflict (organization_id, profile_id) do update set
  role = 'owner',
  status = 'active',
  must_change_password = false;
```
