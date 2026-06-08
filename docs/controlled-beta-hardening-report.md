# Controlled Beta Hardening Report

Generated: June 7, 2026

Review target: Juniper Berry Productions after My Auditor Alpha and the botanical logo/icon pass.

Latest local baseline reviewed:

- `12c488c3 Update Juniper Berry brand assets`
- `bcdc1c4c Add My Auditor alpha`
- `62e66f2b Add receipts and invoices alpha`
- `04c1812d Add account activity tracking`

## Executive Summary

Juniper Berry Productions is in a credible controlled-beta state for another Owner/Admin reviewer. The app now has a coherent financial-control loop: event planning, budget/revenue tracking, private receipt/invoice support, audit history, account activity, soft archive/restore, role controls, and deterministic My Auditor readiness checks.

No P0 blocker was found in this pass. The main remaining risk is not one broken workflow; it is cross-module consistency as more reviewers use the system. Before a broader beta, the team should tighten archived-record visibility expectations, do one authenticated mobile/desktop pass across the dense tables, and decide how much unfinished scaffold should remain addressable by URL.

## Overall Beta-Readiness Verdict

Ready for another controlled Owner/Admin reviewer.

Not ready for broad beta without a short hardening sprint.

Recommended posture:

- Invite one more controlled Admin reviewer with clear test instructions.
- Keep My Contacts, venue maps, TicketLeap imports, and AI-assisted Auditor work out of scope.
- Fix or explicitly accept the P1 items below before adding another major module.

## What Is Working Well

- Branding is now consistent in active app surfaces: production `/login` returns title `Juniper Berry Productions`, the login/sidebar logo uses the updated wordmark, and the legal footer remains Giant Juniper LLC.
- Server-only Supabase service-role usage remains isolated to server modules and server actions; no `NEXT_PUBLIC` service-role exposure was found in `src` or `public`.
- Vercel production runtime logs had no `error` or `fatal` entries in the 24-hour sweep reviewed during this pass.
- Receipts & Invoices Alpha uses a private Storage bucket, server-mediated signed download redirects, file type checks, and 10 MB upload validation.
- Delete/restore behavior is consistently modeled as soft archive/restore for events, budget items, revenue items, ticket tiers, and financial documents.
- Activity labels cover archive/restore and document events, and expanded audit details redact sensitive keys.
- Account Activity Tracking is intentionally separate from event Activity and is Owner/Admin-only through Settings > Team.
- My Auditor is deterministic, read-only, active-event scoped, and does not write audit rows just from viewing.

## P0 Issues - Must Fix Before Next Beta Invite

None found in this pass.

## P1 Issues - Should Fix Before Broader Beta

1. Archived-record visibility needs one explicit policy decision across modules.

   Event detail financial tabs hide archived rows/documents from Producer/Viewer by using role-aware `canViewArchived` logic. My Auditor intentionally queries active events but also evaluates archived budget, revenue, ticket, and document metadata and can surface archived counts/info messages to any role that can open My Auditor. That may be fine, but it should be explicitly accepted or adjusted before broader beta.

   Evidence:

   - `src/lib/data/events.ts` filters archived financial/document data for non-delete roles.
   - `src/lib/data/auditor.ts` includes archived financial rows and archived document metadata in Auditor info checks.

2. Dense authenticated UI needs a full mobile/tablet smoke pass.

   The highest-density surfaces are Budget documents, Revenue & Settlement, Activity filters, Settings > Team, Recent Access Activity, and My Auditor rows. The desktop patterns are coherent, but before inviting non-technical beta users, run these on a narrow mobile viewport and a tablet-width viewport to catch overflow, clipped controls, and hard-to-tap archive/restore forms.

3. Direct scaffold routes are still addressable by URL.

   `Contacts` and `Venues` are no longer primary beta nav items, but `/dashboard/contacts` and `/dashboard/venues` still render scaffold pages if a user guesses or follows an old link. This is not a security issue, but it can confuse beta reviewers and make the app feel less finished.

4. Broader beta needs a repeatable regression script.

   Current confidence comes from focused manual/app-action QA and production smokes. That is appropriate for alpha checkpoints, but broader beta should have a compact repeatable script or checklist run for: Owner/Admin, Producer, Viewer, removed user, document upload/download, archive/restore, Activity, Account Activity, and My Auditor.

## P2 Issues - Later Polish

1. Dashboard still shows an `Overdue tasks` placeholder even though task tracking is not active. It is honest, but it adds noise to the primary dashboard.

2. The historical financial beta audit document still contains old brand language. This is acceptable as a historical artifact, but it should be clearly treated as archived/reference material if docs are shared with beta reviewers.

3. README current-state wording has a few alpha-era phrases that could be tightened, including generic "delete" wording where user-facing behavior is now archive/restore.

4. My Auditor currently reviews all active events when an event detail page renders its Auditor summary card. This is fine for current beta volume, but it may become a performance issue as event count grows.

5. Recent Access Activity intentionally has no filtering/export yet. That is acceptable for Alpha, but Admin reviewers may ask for filtering once activity volume grows.

6. Activity timestamps display in UTC. That is useful for audit consistency, but user-facing beta reviewers may expect local venue/business time later.

## Security/Control Findings

- No public service-role key exposure was found in `src` or `public`.
- `SUPABASE_SERVICE_ROLE_KEY` is read only through `src/lib/supabase/admin.ts`, which is marked `server-only`.
- Service-role usage is limited to server actions/routes for user management, auth activity, document upload metadata, and signed download URL creation.
- Signed document download redirects are created server-side and expire after 60 seconds.
- Audit and auth-activity metadata sanitizers redact password, token, secret, service-role, API key, and authorization-style keys.
- Production Vercel runtime log sweep found no `error` or `fatal` logs for the reviewed 24-hour window.
- No RLS change is recommended from this pass without first resolving the archived-metadata visibility policy question.

## Accounting/Financial Workflow Findings

- Dashboard financial totals use active event, budget, revenue, and ticket rows only.
- Event financial tabs exclude archived budget/revenue/ticket records from active totals and show archived restore surfaces only to Owner/Admin.
- Receipts/invoices clear the missing-document warning only when an active receipt or invoice exists.
- My Auditor correctly focuses on deterministic readiness issues: missing support documents, unaccepted documents, rejected documents, negative nets, incomplete actuals, settlement notes, missing venues, and upcoming planning events.
- Budget item vendor/contact support is partially prepared at the data/UI layer, but the broader Contacts workflow is intentionally not active yet.

## UX/Noise Findings

- The updated brand/logo direction is strong and fits the current dark green/blue system.
- Primary navigation is focused: Dashboard, Events, My Team, My Auditor, and role-gated Settings.
- The `Coming soon` My Contacts marker is clearer than linking to unfinished CRM, but direct scaffold URLs still exist.
- Activity and document forms are powerful but dense; mobile QA is the main remaining UX risk.
- My Auditor is appropriately conservative and explains that it is deterministic and read-only.

## Documentation Gaps

- Add a short controlled-beta reviewer guide before sending the app to another non-builder reviewer.
- Clearly separate historical audit documents from current beta operating docs.
- Tighten README wording around archive/restore versus delete.
- Keep the roadmap explicit that My Contacts, venue maps, TicketLeap imports, and AI Auditor are not part of the next immediate build unless the beta hardening sprint changes priorities.

## Recommended Next Sprint

Run a narrow Beta Hardening Sprint before starting My Contacts or CRM work.

Recommended scope:

- Decide archived metadata visibility for My Auditor by role.
- Hide, redirect, or strongly mark direct scaffold routes.
- Run and document mobile/tablet smoke QA for the dense authenticated surfaces.
- Tighten current-state README language.
- Keep dashboard noise low by either removing or reframing inactive task placeholders.

After that, invite one more controlled Admin reviewer. If that reviewer pass is clean, choose between My Contacts Alpha and vendor/contact support for budget items.

## Explicit Do Not Build Yet List

- Do not start My Contacts / CRM Alpha yet.
- Do not start venue maps.
- Do not start TicketLeap import.
- Do not add AI-generated Auditor recommendations.
- Do not add OCR, invoice parsing, or automated document extraction.
- Do not add background jobs or scheduled Auditor runs.
- Do not add external email, SMS, Slack, or Discord notifications.
- Do not change RLS or the service-role model unless a confirmed security/control issue requires it.
