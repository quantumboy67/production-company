# Event Command Center

Private internal MVP for live music event production management.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui-style components
- Supabase Auth, Postgres, Row Level Security, private Storage
- Vercel deployment

## Supabase Setup

1. Create a Supabase project.
2. In Supabase, enable Email/Password auth under Authentication > Providers.
3. Copy the Project URL and publishable/anon key from Project Settings > API.
4. Apply the migration in `supabase/migrations/202606050001_initial_event_command_center.sql`.

You can apply the migration with the Supabase SQL editor, or with the Supabase CLI after linking the project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration creates:

- Postgres schema and indexes
- Row Level Security policies
- Explicit authenticated grants for Supabase Data API access
- Private `event-documents` Storage bucket
- Default budget categories and task templates
- Sample event data for `Cedric Burnside @ Fairweather`

## First User And Organization

1. Create the first user in Supabase Authentication > Users.
2. Sign in to the app.
3. If the user has no profile or organization, the app redirects to `/onboarding`.
4. Enter a full name and organization name.
5. The app creates the organization, profile, and a scoped demo `Cedric Burnside @ Fairweather` event using the authenticated Supabase server client.

Manual SQL is only needed as a fallback/admin repair path:

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

If a signed-in user already has a profile and organization, `/onboarding` redirects back to `/dashboard`.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

3. Fill in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

Do not put a Supabase service role key in any `NEXT_PUBLIC_` variable. This app currently uses only the publishable/anon key with Supabase Auth and RLS.

4. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Supabase Type Generation

Install and authenticate the Supabase CLI, then generate database types.

PowerShell:

```powershell
$env:SUPABASE_PROJECT_ID="YOUR_PROJECT_REF"
npm run types:supabase
```

Cross-platform alternative:

```bash
supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public > src/lib/supabase/database.types.ts
```

After generating types, wire `database.types.ts` into `src/lib/supabase/server.ts` and `src/lib/supabase/browser.ts`.

## Vercel Deployment

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add these environment variables in Vercel Project Settings:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

4. Confirm the build command is:

```bash
npm run build
```

5. Deploy.

The app uses server-side Supabase clients for protected data. Browser Supabase client code uses only the publishable/anon key and should be reserved for future client-side flows such as uploads.

## MVP Scope

Implemented first:

- Login via Supabase Auth
- Self-service onboarding for first organization/profile
- Organization-scoped demo data creation after onboarding
- Protected dashboard layout
- Event list
- Event create, edit, delete
- Event detail tabs
- Functional Budget and Revenue / Settlement tabs
- Seeded live concert production budget categories
- Seeded support act line for The Sugar Thieves
- Ticket tiers for GA and VIP 4-top tables
- Settlement calculations for gross revenue, expenses, net profit/loss, break-even, and partner split

Scaffolded for next phases:

- Contacts directory
- Venues directory
- Run of Show
- Tasks
- Contracts / Files
- Sponsorships
- Settings
