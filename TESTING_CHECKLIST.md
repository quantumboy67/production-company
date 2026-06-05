# Juniper Berry Production Company Testing Checklist

## Auth

- [ ] Visit `/login` while logged out.
- [ ] Sign in with a valid Supabase Auth user.
- [ ] Confirm logged-out access to `/dashboard` redirects to `/login`.
- [ ] Confirm a signed-in user without a profile row redirects to `/onboarding`.
- [ ] Confirm `/onboarding` shows full name and organization name fields.
- [ ] Submit onboarding and confirm it redirects to `/dashboard`.
- [ ] Confirm the newly onboarded organization sees `Cedric Burnside @ Fairweather`.
- [ ] Confirm revisiting `/onboarding` after setup redirects to `/dashboard`.
- [ ] Sign out and confirm the browser returns to `/login`.

## Dashboard

- [ ] Confirm dashboard loads after sign-in.
- [ ] Confirm upcoming event count appears.
- [ ] Confirm the seeded `Cedric Burnside @ Fairweather` event appears after profile setup.
- [ ] If an organization is empty, click `Create demo event` and confirm demo data appears.

## Event CRUD

- [ ] Create a new event.
- [ ] Edit event name, date, status, capacity, and notes.
- [ ] Delete the test event.
- [ ] Confirm event pages do not show events from another organization.

## Budget

- [ ] Open an event detail page and select `Budget`.
- [ ] Confirm hard costs and soft costs render separately.
- [ ] Confirm the headliner guarantee is `$10,000`.
- [ ] Confirm support act line exists for `The Sugar Thieves`.
- [ ] Add, edit, batch-save, discard, and delete budget rows.
- [ ] Confirm budget delete requires confirmation before removal.

## Revenue And Ticket Tiers

- [ ] Select `Revenue / Settlement`.
- [ ] Confirm ticket tiers include `GA` and `VIP 4-top tables`.
- [ ] Confirm projected gross uses ticket price times tier capacity.
- [ ] Add, edit, and delete revenue rows.
- [ ] Add, edit, and delete ticket tiers.
- [ ] Confirm revenue and ticket tier deletes require confirmation before removal.

## Settlement

- [ ] Confirm gross revenue includes projected ticket gross plus other projected revenue.
- [ ] Confirm total expenses include hard and soft budget items.
- [ ] Confirm net profit/loss equals gross revenue minus total expenses.
- [ ] Confirm break-even equals total expenses.
- [ ] Confirm true 50/50 partner split displays two split amounts.

## RLS Behavior

- [ ] Create or identify two Supabase Auth users.
- [ ] Put each user in a different organization/profile.
- [ ] Confirm each user sees only their own organization rows.
- [ ] Confirm direct Data API requests as `authenticated` cannot read another organization row.
- [ ] Confirm unauthenticated requests cannot read organization-owned tables.

## Files

- [ ] File upload UI is not implemented yet.
- [ ] Confirm the private `event-documents` bucket exists.
- [ ] Confirm Storage policies require authenticated users and an organization-prefixed path.

## Beta Readiness Smoke

- [ ] Confirm live beta URL access does not unexpectedly require Vercel login, or document the Vercel share/protection flow for testers.
- [ ] Confirm primary navigation shows only beta-ready modules.
- [ ] Confirm scaffold-only modules are hidden, disabled, or clearly marked as coming later.
- [ ] Confirm approved Juniper Berry logo and favicon are visible after deployment.
- [ ] Confirm existing demo/QA settlement partner names use Juniper Berry Production Company.
- [ ] Confirm dashboard financial labels match event settlement terminology.
