# Deployment Checklist

## Supabase

- [ ] Create Supabase project.
- [ ] Enable Email/Password auth.
- [ ] Apply `supabase/migrations/202606050001_initial_event_command_center.sql`.
- [ ] Confirm RLS is enabled on all public app tables.
- [ ] Confirm private Storage bucket `event-documents` exists.
- [ ] Create the first Auth user.
- [ ] Sign in and complete `/onboarding` to create the first organization/profile.
- [ ] Confirm onboarding also creates the scoped `Cedric Burnside @ Fairweather` demo event.
- [ ] Confirm the user can reach `/dashboard`.
- [ ] Optional: generate TypeScript database types with `npm run types:supabase`.

## Environment Variables

- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` locally in `.env.local`.
- [ ] Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` locally in `.env.local`.
- [ ] Confirm no service role key is present in `.env.local`, Vercel env vars, or client code.
- [ ] Set the same public Supabase variables in Vercel Project Settings.

## Vercel

- [ ] Push repo to GitHub.
- [ ] Import repo into Vercel.
- [ ] Confirm build command is `npm run build`.
- [ ] Confirm install command is `npm install`.
- [ ] Deploy preview.
- [ ] Smoke test preview URL.
- [ ] Promote to production when preview is clean.

## Preflight Commands

```bash
npm run lint
npm run build
```

## Manual Supabase SQL Fallback

```sql
insert into public.profiles (id, organization_id, full_name, role)
select
  'AUTH_USER_ID_HERE',
  id,
  'Your Name',
  'admin'
from public.organizations
where slug = 'desert-night-productions'
on conflict (id) do update set
  organization_id = excluded.organization_id,
  full_name = excluded.full_name,
  role = excluded.role;
```
