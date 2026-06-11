# Juniper Berry Productions

Private internal MVP for Juniper Berry Productions' live music event production management.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui-style components
- Supabase Auth, Postgres, Row Level Security, private Storage
- Vercel deployment

## Supabase Setup

1. Create a Supabase project.
2. In Supabase, enable Email/Password auth under Authentication > Providers.
3. Copy the Project URL and publishable/anon key from Project Settings > API.
4. Apply the migrations in `supabase/migrations` in order.

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
- Access Control Alpha membership roles and RLS policies
- Audit Trail Alpha `audit_log` table, indexes, and append-only RLS posture
- Receipts & Invoices Alpha `financial-documents` private Storage bucket and budget item document metadata
- Invitation Requests Alpha `invite_requests` table for login-page access requests

## First User And Organization

1. Create the first user in Supabase Authentication > Users.
2. Sign in to the app.
3. If the user has no profile or organization, the app redirects to `/onboarding`.
4. Enter a full name and organization name.
5. The app creates the organization, profile, and a scoped demo `Cedric Burnside @ Fairweather` event using the authenticated Supabase server client.

Manual SQL is only needed as a fallback/admin repair path:

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

For Access Control Alpha, add the service role key locally as a server-only variable:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Do not put a Supabase service role key in any `NEXT_PUBLIC_` variable. Never log it, render it, or import the admin client into client components.

Optional invitation request email notifications use server-only variables. Leave these blank to store login-page requests without sending email:

```bash
INVITE_REQUEST_NOTIFY_EMAIL=owner@example.com
INVITE_REQUEST_FROM_EMAIL=Juniper Berry Productions <noreply@example.com>
RESEND_API_KEY=your-resend-api-key
```

Do not put email provider keys in any `NEXT_PUBLIC_` variable.

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
SUPABASE_SERVICE_ROLE_KEY
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
- Invite-only Team management for Owner/Admin users
- Forced password change for temporary-password users
- Viewer read-only restrictions and Producer event/financial editing permissions
- Event Activity tab backed by append-only audit logs for event, financial, settlement, and team access changes

Scaffolded for next phases:

- Contacts directory
- Venues directory
- Run of Show
- Tasks
- Contracts / Files
- Sponsorships
- Settings

## Audit Trail Alpha

Audit Trail Alpha records important logged-in user activity in `public.audit_log`.

Currently audited:

- event create, update, delete
- budget item create, update, delete, and batch update
- revenue item create, update, delete
- ticket tier create, update, delete
- settlement update
- team member invite, role change, removal, forced password change, and completed password change
- financial document upload, status change, archive, and restore

Audit rows include actor context, action, summary, before/after JSON where useful, and metadata such as related `event_id`.

The audit trail intentionally does not log temporary passwords, password contents, auth tokens, service-role keys, or raw secret values. Normal app users can read audit rows for their active organization, but cannot directly insert, update, or delete audit rows. Inserts are performed by trusted server-side actions only.

Deletion Safety + Restore Alpha treats user-facing delete actions as archive/soft-delete for app-owned events and financial records. Owner/Admin users can archive with confirmation and optional reason, then restore archived events, budget items, revenue items, and ticket tiers from simple restore surfaces. Producers can edit allowed records but cannot delete; Viewers cannot mutate. See `docs/deletion-safety-alpha.md` for the inventory, audit event names, and hard-delete exceptions.

Event-level audit rows are visible in the event detail `Activity` tab. In Alpha, Viewer, Producer, Admin, and Owner users who can access the event can view its Activity tab as read-only.

## Receipts & Invoices Alpha

Receipts & Invoices Alpha attaches private financial documents to event budget items. Supported document types are receipt, invoice, quote, W-9, COI, contract, and other. Supported uploads are PDF, PNG, JPG/JPEG, WEBP, CSV, and XLSX up to 10 MB.

Document metadata is stored in `public.budget_item_documents`; files are stored in the private `financial-documents` Supabase Storage bucket. Download links are server-mediated and use short-lived signed URLs. Owner/Admin/Producer users can upload documents and update non-archived document statuses. Owner/Admin users can archive and restore documents. Viewer users can read document metadata and download active documents for events they can access, but cannot mutate records.

Budget rows show compact receipt/invoice indicators. Actual or paid budget items warn when no receipt/invoice is attached, invoices warn until accepted, and documents marked `needs_review` are surfaced for review.

Audited document events:

- `financial_document.uploaded`
- `financial_document.status_changed`
- `financial_document.archived`
- `financial_document.restored`

Audit rows include document names, types, statuses, sizes, and related event/budget item IDs. They do not include file contents, signed URLs, passwords, tokens, temporary passwords, service-role keys, or raw secrets.

This alpha does not include OCR, invoice parsing, missing-document email/SMS notifications, CRM, venue maps, or TicketLeap imports.

## My Auditor Alpha

My Auditor Alpha is a deterministic, read-only event financial readiness checker. It reviews active events in the user's organization and summarizes completeness issues across event details, budget items, revenue items, ticket tiers, settlements, and receipt/invoice document metadata.

Current checks include missing budget items, estimated expenses without actuals, actual or paid expenses without an active receipt/invoice, documents that need review or are not accepted, rejected documents on active budget items, archived records, negative projected or actual net, projected revenue without actuals, ticket tiers with capacity and zero sold quantity, missing settlement notes, incomplete settlement actuals, missing venues, and close upcoming events still in planning.

Severities are `critical`, `warning`, `info`, and `pass`. My Auditor does not auto-fix records, does not write audit rows for reads, does not use AI, and does not expose records outside the active organization. Owner/Admin/Producer users can view it, and Viewer users can view the same read-only auditor results because the underlying active event and financial records are already read-only for Viewers.

Future versions may add AI review, scheduled checks, exports, notification digests, and deeper reconciliation workflows.

## Account Activity Tracking Alpha

Account Activity Tracking Alpha records account access and team lifecycle events in `public.auth_activity`.

Tracked events:

- `user.invited`
- `user.login`
- `user.logout`
- `user.first_login_completed`
- `user.password_changed`
- `user.password_change_required`
- `user.role_changed`
- `user.removed`
- `user.reactivated` reserved for future reactivation support

Login activity is recorded when a user successfully submits the login form and the app validates an active organization membership. It is not recorded on every page load or session refresh. Logout activity means the user clicked Sign out; browser close, tab close, and session expiry are not treated as logout events.

Owner/Admin users can view the latest account activity in Settings -> Team. Producer/Viewer users do not have access to the account activity table or the Settings -> Team page.

Account activity records never include passwords, temporary passwords, auth tokens, service-role keys, or raw secret values. Notification delivery is intentionally not implemented yet. Future options include Owner/Admin email notifications, a daily digest, Slack/Discord webhooks, and SMS later.

## Invitation Requests Alpha

The app remains invite-only. The login page includes a `Request an invitation` form for people who do not have accounts. Submitting the form creates an `invite_requests` row for Owner/Admin review; it does not create an Auth user, does not send a Supabase invite, and does not reveal whether the email already exists.

Owner/Admin users can review pending requests in Settings -> Team and mark them reviewed, declined, or spam. Producer and Viewer users cannot access invitation requests.

Public login-page requests use an app-level request model with `organization_id` left blank because the requester is not signed in and may not know which organization should approve them. In the current controlled-beta deployment, Owner/Admin users review those pending app-level requests from Settings -> Team.

Invitation request notification email is optional. If `INVITE_REQUEST_NOTIFY_EMAIL`, `INVITE_REQUEST_FROM_EMAIL`, and `RESEND_API_KEY` are configured, the server action sends a Resend email to the configured admin address. If any variable is missing or email delivery fails, the request is still stored and the requester sees the same neutral success message.

Invitation request submissions are represented by the stored request row and a minimal server log line named `invite_request.submitted`. Owner/Admin review actions are written to `audit_log` as `invite_request.reviewed`, `invite_request.declined`, or `invite_request.marked_spam`.

Invitation requests never log passwords, temporary passwords, tokens, service-role keys, or email API keys.
