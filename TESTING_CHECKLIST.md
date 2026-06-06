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

## Access Control Alpha

- [ ] Apply the Access Control Alpha migration and confirm the existing dummy QA user is an active Owner.
- [ ] Confirm active members can access `/dashboard/team`.
- [ ] Confirm Owner/Admin sees the My Team `Manage team` link to Settings > Team.
- [ ] Confirm Viewer/Producer can view My Team but do not see management controls.
- [ ] Confirm removed/disabled users cannot access My Team.
- [ ] Confirm Owner can access Settings > Team.
- [ ] Owner invites a Viewer with a temporary password.
- [ ] Viewer logs in and is redirected to `/change-password`.
- [ ] Viewer creates a new password and reaches `/dashboard`.
- [ ] Viewer can view dashboard, events, Budget, and Revenue & Settlement.
- [ ] Viewer cannot see create/edit/save/delete controls for events or financials.
- [ ] Viewer cannot access Settings > Team.
- [ ] Owner promotes Viewer to Producer.
- [ ] Producer can create/edit events and financial records.
- [ ] Producer cannot delete events or financial records.
- [ ] Producer cannot access Settings > Team.
- [ ] Owner promotes Producer to Admin.
- [ ] Admin can invite and manage non-Owner users.
- [ ] Admin cannot remove or demote an Owner.
- [ ] Owner cannot remove the last active Owner.
- [ ] Owner removes/deactivates the test user and the removed user loses dashboard/org access.
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is server-only and never appears in browser code or console output.

## Team & Access-Control Polish

- [ ] Confirm Settings > Team shows active members first.
- [ ] Confirm removed/disabled members are hidden in a collapsed inactive section by default.
- [ ] Confirm inactive member rows are read-only and do not show role-change, password-reset, or remove controls.
- [ ] Select Admin in the invite form and confirm the Admin access warning appears.
- [ ] Confirm Admin invites require the warning checkbox.
- [ ] Confirm invite success copy shows email, role, private temporary-password guidance, and first-login password-change guidance.
- [ ] Confirm Viewer financial tabs show view-only messaging and no active edit/delete controls.
- [ ] Confirm Producer financial tabs allow editing but explain that only Admins/Owners can delete financial records.
- [ ] Confirm invite, role-change, force-reset, and removal actions still create audit events.

## Audit Trail Alpha

- [ ] Apply the Audit Trail Alpha migration and confirm `public.audit_log` exists.
- [ ] Confirm active organization members can read audit logs for their organization.
- [ ] Confirm normal authenticated clients cannot directly insert, update, or delete audit logs.
- [ ] Open an event detail page and confirm the `Activity` tab appears.
- [ ] Owner updates an event title/date and confirms an `event.updated` row appears in Activity.
- [ ] Owner adds, edits, and deletes a budget item and confirms audit rows appear.
- [ ] Owner uses Budget Save All and confirms one `budget_items.batch_updated` row appears.
- [ ] Owner adds, edits, and deletes a revenue item and confirms audit rows appear.
- [ ] Owner adds, edits, and deletes a ticket tier and confirms audit rows appear.
- [ ] Owner updates settlement notes and confirms a `settlement.updated` row appears.
- [ ] Owner invites a user and confirms `team_member.invited` is logged.
- [ ] Owner changes a user role and confirms `team_member.role_changed` is logged.
- [ ] Owner removes a user and confirms `team_member.removed` is logged.
- [ ] Temporary password change completion logs `team_member.password_changed`.
- [ ] Confirm no passwords, temporary passwords, service keys, auth tokens, or secrets appear in audit details.
- [ ] Confirm Viewer can see event Activity read-only but still cannot mutate financials.

## Dashboard

- [ ] Confirm dashboard loads after sign-in.
- [ ] Confirm top summary cards appear for next event, projected P/L, actual / entered P/L, and overdue tasks placeholder.
- [ ] Confirm monthly calendar appears.
- [ ] Confirm today is visually distinct.
- [ ] Confirm previous/next month navigation works.
- [ ] Confirm the seeded `Cedric Burnside @ Fairweather` event appears after profile setup.
- [ ] Navigate to September 2026 and confirm `Cedric Burnside @ Fairweather` appears on its event date.
- [ ] Click the Cedric event date and confirm the selected-date panel lists the event.
- [ ] Click the event from the selected-date panel and confirm it opens event detail.
- [ ] Click `Add event on this date` and confirm the New Event form prefills the selected start date.
- [ ] Confirm selected date/month context is clear in the calendar and selected-date panel.
- [ ] Click `View upcoming events list` and confirm the financial list appears.
- [ ] Confirm the upcoming list includes projected revenue, estimated expenses, projected net, actual / entered revenue, actual / paid expenses, and actual / entered net.
- [ ] Confirm the print button is visible when the upcoming list is open.
- [ ] Confirm print preview excludes sidebar/nav clutter and keeps upcoming event rows readable.
- [ ] If an organization is empty, click `Create demo event` and confirm demo data appears.

## Event CRUD

- [ ] Create a new event.
- [ ] Edit event name, date, status, capacity, and notes.
- [ ] Confirm Admin/Owner sees an event delete confirmation before deletion.
- [ ] Confirm Producer/Viewer cannot see event delete controls.
- [ ] Delete the test event.
- [ ] Confirm event pages do not show events from another organization.

## Budget

- [ ] Open an event detail page and select `Budget`.
- [ ] Confirm hard costs and soft costs render separately.
- [ ] Confirm the headliner guarantee is `$10,000`.
- [ ] Confirm support act line exists for `The Sugar Thieves`.
- [ ] Confirm budget rows are easy to scan by category, description, estimate, actual/paid, status, and notes.
- [ ] Add, edit, batch-save, discard, and delete budget rows.
- [ ] Confirm unsaved Budget Save All edits warn before switching event tabs.
- [ ] Add a budget item and confirm the newly added row is briefly highlighted.
- [ ] Confirm budget delete requires confirmation before removal.

## Revenue And Ticket Tiers

- [ ] Select `Revenue & Settlement`.
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
- [ ] Confirm primary navigation shows Dashboard, Events, My Team, and role-appropriate Settings.
- [ ] Confirm event detail tabs show Overview, Budget, Revenue & Settlement, and Activity.
- [ ] Confirm approved Juniper Berry logo and favicon are visible after deployment.
- [ ] Confirm existing demo/QA settlement partner names display as Juniper Berry Production Company.
- [ ] Confirm dashboard financial labels match event settlement terminology.
