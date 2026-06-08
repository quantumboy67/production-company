# Juniper Berry Productions Testing Checklist

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
- [ ] Confirm deletion now means archive/soft-delete for events, budget items, revenue items, and ticket tiers.
- [ ] Confirm Admin/Owner delete dialogs name the record, require the archive confirmation payload, and allow an optional reason.
- [ ] Confirm Owner can archive and restore an event from the Events list with `Include archived`.
- [ ] Confirm archived events do not appear on the normal dashboard/events views.
- [ ] Confirm Owner/Admin can archive and restore budget items from the Budget tab archived section.
- [ ] Confirm Owner/Admin can archive and restore revenue items and ticket tiers from the Revenue / Settlement tab archived section.
- [ ] Confirm archived financial rows are excluded from active totals and restored rows return to totals.
- [ ] Confirm Activity labels show archived/restored events for events, budget items, revenue items, and ticket tiers.
- [ ] Confirm team member removal opens a confirmation dialog before access is removed.
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

## Audit Trail Enhancements

- [ ] Confirm Activity summary counts appear for total activity, financial changes, event changes, team/access, and settlement changes.
- [ ] Update a budget item and confirm the Activity count changes after reload.
- [ ] Filter Activity by actor and confirm only that actor's audit rows remain.
- [ ] Filter Activity by action and confirm financial actions can be isolated.
- [ ] Filter Activity by entity type and confirm budget, revenue, settlement, event, and team rows are distinguishable where present.
- [ ] Search Activity by budget item summary text and confirm matching rows appear.
- [ ] Use start/end date filters and confirm the visible Activity list narrows correctly.
- [ ] Expand before/after details and confirm they are readable.
- [ ] Confirm details redact sensitive keys such as password, token, secret, service role, and API key.
- [ ] Export filtered Activity CSV and confirm it includes timestamp, actor, action, entity type, and summary only.
- [ ] Confirm CSV export does not include full before/after JSON.
- [ ] Confirm Viewer and Producer Activity visibility follows current event-access policy.

## Account Activity Tracking Alpha

- [ ] Apply the Account Activity Tracking Alpha migration and confirm `public.auth_activity` exists.
- [ ] Confirm Owner/Admin can read account activity for their organization.
- [ ] Confirm Producer/Viewer cannot read `auth_activity` and cannot access Settings -> Team.
- [ ] Owner invites a test user and confirms `user.invited` appears in Recent Access Activity.
- [ ] Test user logs in and confirms `user.login` appears after the Owner reloads Settings -> Team.
- [ ] Test user changes the temporary password and confirms `user.first_login_completed` and `user.password_changed` appear.
- [ ] Test user clicks Sign out and confirms `user.logout` appears.
- [ ] Owner changes the test user's role and confirms `user.role_changed` appears.
- [ ] Owner forces password change and confirms `user.password_change_required` appears.
- [ ] Owner removes/deactivates the test user and confirms `user.removed` appears.
- [ ] Confirm Recent Access Activity shows the latest 20 events with timestamp, user/email, event type, and description.
- [ ] Confirm no passwords, temporary passwords, service keys, auth tokens, or secrets appear in `auth_activity.metadata`.
- [ ] Confirm browser console has no app runtime errors while viewing Settings -> Team.

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

## Receipts & Invoices Alpha

- [ ] Apply the Receipts & Invoices Alpha migration and confirm `public.budget_item_documents` exists.
- [ ] Confirm the private `financial-documents` Storage bucket exists.
- [ ] Confirm Owner/Admin/Producer can upload PDF, PNG, JPG/JPEG, WEBP, CSV, and XLSX documents up to 10 MB to a budget item.
- [ ] Confirm unsupported file types and files over 10 MB are rejected.
- [ ] Confirm document types include receipt, invoice, quote, W-9, COI, contract, and other.
- [ ] Confirm document statuses include uploaded, needs review, accepted, rejected, and archived.
- [ ] Confirm Owner/Admin/Producer can update active document status and notes.
- [ ] Confirm Owner/Admin can archive a document with confirmation and optional reason.
- [ ] Confirm archived documents leave the active budget-row document list and appear in the archived document section for Owner/Admin.
- [ ] Confirm Owner/Admin can restore archived documents and restored documents return as needs review.
- [ ] Confirm Producer cannot archive or restore documents.
- [ ] Confirm Viewer can view/download active documents but cannot upload, update, archive, or restore.
- [ ] Confirm active downloads use server-mediated signed URLs and the Storage bucket is not public.
- [ ] Confirm budget rows warn when actual/paid costs have no receipt or invoice.
- [ ] Confirm invoices warn until accepted and needs-review documents are surfaced.
- [ ] Confirm `financial_document.uploaded`, `financial_document.status_changed`, `financial_document.archived`, and `financial_document.restored` appear in Activity.
- [ ] Confirm Activity filters/search can find document events.
- [ ] Confirm audit details do not include file contents, signed URLs, passwords, temporary passwords, tokens, service-role keys, or raw secrets.
- [ ] Confirm Budget Save All still works with document UI present.

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

- [ ] Confirm the private `event-documents` bucket exists for legacy/future event document support.
- [ ] Confirm the private `financial-documents` bucket exists for Receipts & Invoices Alpha.
- [ ] Confirm Storage policies require authenticated users and an organization-prefixed path.

## My Auditor Alpha

- [ ] Confirm Owner can open My Auditor from the primary navigation.
- [ ] Confirm My Auditor lists active events only and links each event back to event detail.
- [ ] Confirm actual or paid budget items without active receipt/invoice documents are flagged as critical.
- [ ] Confirm uploading an active receipt/invoice clears the missing-document issue.
- [ ] Confirm `needs_review`, unaccepted receipt/invoice, and rejected document statuses are flagged.
- [ ] Confirm negative projected or actual/entered net is flagged when test data creates it.
- [ ] Confirm settlement notes and incomplete actual revenue/expense inputs are flagged.
- [ ] Confirm Producer can view read-only auditor results.
- [ ] Confirm Viewer can view read-only auditor results and cannot mutate underlying records.
- [ ] Confirm no cross-organization data appears in auditor results.
- [ ] Confirm opening My Auditor does not create audit rows.
- [ ] Confirm browser console has no runtime errors.

## Beta Readiness Smoke

- [ ] Confirm live beta URL access does not unexpectedly require Vercel login, or document the Vercel share/protection flow for testers.
- [ ] Confirm primary navigation shows Dashboard, Events, My Team, My Auditor, and role-appropriate Settings.
- [ ] Confirm event detail tabs show Overview, Budget, Revenue & Settlement, and Activity.
- [ ] Confirm approved Juniper Berry logo and favicon are visible after deployment.
- [ ] Confirm existing demo/QA settlement partner names display as Juniper Berry Productions.
- [ ] Confirm dashboard financial labels match event settlement terminology.

## Controlled Beta Hardening

- [ ] Confirm My Auditor archived-record visibility matches the accepted role policy for Owner/Admin, Producer, and Viewer.
- [ ] Confirm `/dashboard/contacts` and `/dashboard/venues` are either inaccessible to beta testers or clearly marked as future/scaffolded pages.
- [ ] Run Dashboard, Events, Budget documents, Revenue & Settlement, Activity, Settings > Team, Recent Access Activity, and My Auditor on mobile and tablet-width viewports.
- [ ] Confirm authenticated production browser console is clean while exercising document upload/download, archive/restore, Activity, Account Activity, and My Auditor.
- [ ] Confirm Vercel production runtime logs have no `error` or `fatal` entries after the authenticated smoke pass.
- [ ] Confirm beta-facing docs describe archive/restore behavior and do not present historical alpha wording as current product guidance.
