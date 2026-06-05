# Beta Audit: Financial Alpha v0.1

Date: 2026-06-05

App: Juniper Berry Production Company

Auditor perspective: Senior Program Manager and Senior Engineer, with emphasis on accounting controls, workflow trust, permissioning readiness, auditability, and enterprise usability.

Scope reviewed:

- Local app at `http://localhost:3004`
- Live app at `https://production-company-gettothechorus.vercel.app`
- Dummy QA account flow
- Dashboard, event detail, Budget, Revenue / Settlement, delete confirmations, settlement save/reload, logout
- Branding strings, metadata, favicon/logo wiring in the current working tree
- Security grep for service role exposure

Out of scope:

- No broad UI changes implemented
- No invite-only users or role model implemented
- No audit trail implemented
- No CRM, calendar, contracts/files, sponsorships, or storage uploads implemented
- No RLS or database structure changes made

## 1. Executive Summary

The financial alpha is functionally strong enough to continue toward beta, but it is not yet beta-ready for first external users without a cleanup sprint.

The core Supabase-backed workflow works: login, dashboard, Cedric demo event, budget rows, Budget Save All, revenue rows, ticket tiers, settlement calculation, settlement save/reload, delete confirmation, and logout all completed with the dummy QA account.

The primary beta risk is not core functionality. The primary risk is product trust and clarity. The app shows too many scaffolded modules, too many controls at once, and accounting labels that are usable for an internal builder but not yet clean enough for a producer, promoter, or operations manager seeing the product cold.

Recommended beta gate: run a small cleanup sprint before beta. Hide unfinished modules, tighten financial terminology, reduce row-form noise, fix existing seeded/QA settlement partner naming, and add first-use guidance.

## 2. What Is Working Well

- Authentication works locally with the dummy QA account.
- The dashboard loads after sign-in and shows the Cedric Burnside demo event.
- Event detail routing works and tabs preserve event context.
- Budget hard costs and soft costs are separated.
- Budget Save All appears after editing an existing row and Discard clears unsaved changes.
- Delete confirmation dialogs protect financial record deletion.
- Revenue and ticket tier forms are functional.
- Ticket tier projected and actual gross calculations are visible.
- Settlement save/reload persisted during QA.
- Logout returns the user to the login page.
- Juniper Berry Production Company page title and login branding are present in the current local working tree.
- No service role key is used in browser code. Search found only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in client/server Supabase helpers.
- Vercel deployment is reachable through Vercel share access. The deployed checkpoint shows Juniper Berry text branding and the dashboard data after login.

## 3. Highest-Risk Issues

### P0: Existing deployed access is protected by Vercel authentication

Opening `https://production-company-gettothechorus.vercel.app/login` first routed to a Vercel login screen. A temporary Vercel share URL was required to access the app in the browser session.

This is acceptable for internal protected testing, but beta testers will need either:

- Deployment protection disabled for the beta URL
- Vercel protection bypass links distributed intentionally
- A separate beta deployment URL with known access rules

### P0: Unfinished modules are too visible

The sidebar exposes Contacts, Venues, and Settings. Event detail exposes Run of Show, Tasks, Contacts, Contracts / Files, and Sponsorships. These sections currently show scaffold messages such as "This section is scaffolded for the next MVP phase."

This makes the product feel unfinished and reduces trust, even though the financial module works.

### P1: Financial screens are very dense

Budget and Revenue screens repeat full editable forms for every row. In the Budget tab, there were 19 forms and many repeated Save/Delete buttons. This creates scanning fatigue and makes the app feel noisier than it is.

For beta, the default should be read-first, edit-on-demand.

### P1: Existing QA data still contains old partner naming

The current QA settlement persisted `partner_a_name = "Production Company"`. The code now creates new demo settlements with `Juniper Berry Production Company`, but existing database rows were not renamed.

This is a data cleanup issue, not a code-branding issue.

### P1: No roles or audit trail yet

All signed-in users with an organization profile can currently mutate event/financial data. This is expected for alpha, but it is not acceptable for broader beta with multiple real users.

Deletes are confirmed, but there is no audit log for who changed what, when, or why.

## 4. UI Noise / Cleanup Recommendations

### Dashboard

Current dashboard content:

- Upcoming events count
- Next event date
- Open settlement target
- Next Up card

Recommendations:

- Rename "Open settlement target" to a clearer accounting label, such as "Projected net" or "Projected settlement".
- Add a short first-use note for beta users: "Use Budget and Revenue / Settlement first. Other production modules are coming later."
- Consider showing the next event's financial state directly: estimated expenses, projected revenue, projected net, and unpaid actuals.
- Remove or defer generic dashboard metrics that do not help a production manager decide what to do today.

### Sidebar

Current sidebar entries:

- Dashboard
- Events
- Contacts
- Venues
- Settings

Recommendations for beta:

- Keep: Dashboard, Events
- Keep Settings only if it has useful account/org information
- Hide or mark later: Contacts, Venues, Settings if they remain scaffold-only
- Do not show scaffold-only pages as primary navigation for beta users

### Event Detail Tabs

Current tabs:

- Overview
- Budget
- Revenue / Settlement
- Run of Show
- Tasks
- Contacts
- Contracts / Files
- Sponsorships

Recommendations for beta:

- Keep visible: Overview, Budget, Revenue / Settlement
- Hide or move under "Coming later": Run of Show, Tasks, Contacts, Contracts / Files, Sponsorships
- If they remain visible, clearly mark them as "Coming soon" and disable editing expectations

### Financial Rows

Recommendations:

- Move from always-editable row forms to display rows with Edit buttons.
- Keep Add forms collapsed by default.
- Keep Save All, but show a compact sticky toolbar only when dirty rows exist.
- Group totals higher on the page for quicker decision making.
- Reduce repeated labels inside every row once layout is stable.

## 5. Accounting Workflow Issues

### Budget

What works:

- Hard/soft split is clear.
- Categories match live concert workflow.
- Estimate and actual totals calculate.
- Variance is visible.
- Status options exist.

Issues:

- "Estimate" and "Actual" are under-specified. In accounting workflows, "actual" can mean invoiced, paid, accrued, or expected final.
- Empty actuals are visually close to zero actuals in totals. Empty actual should be distinguishable from true `$0`.
- Statuses are helpful but incomplete for operational finance.
- Date fields are generic. "Due date" and "Paid date" are useful, but invoice date/committed date may later be needed.
- Vendor/contact optional behavior is good for alpha, but beta users may expect vendor search and vendor-required rules for paid costs.

Suggested terminology:

- Estimate -> Budgeted or Estimated
- Actual -> Actual / Paid, or split into Committed, Invoiced, Paid later
- Variance -> Estimated vs Actual variance
- Paid date -> Paid on

Suggested future statuses:

- Planned
- Quoted
- Committed
- Invoiced
- Due
- Paid
- Waived
- Cancelled

### Revenue

What works:

- Revenue categories cover the alpha need: ticket, sponsorship, bar bounty, merch split, other.
- Projected and actual amounts exist.

Issues:

- "Estimate" appears on revenue forms while code/data refers to projected amount. Use one term consistently.
- Revenue statuses should distinguish projected, contracted, received, comped/waived where relevant.
- Sponsorship revenue will need linkage to sponsorship records later.

### Ticket Tiers

What works:

- GA and VIP tiers are visible.
- Projected gross is price x capacity.
- Actual gross is price x sold quantity.
- Comps are captured.

Issues:

- Comp quantity does not currently explain how it affects capacity or gross.
- Capacity, sold, and comps should guard against impossible values, such as sold plus comps greater than capacity.
- Ticket price should be clearly currency-formatted.
- "Actual gross" should be clear that comps do not generate gross.

### Settlement

What works:

- Gross revenue, total expenses, net profit/loss, break-even, and partner splits are visible.
- Settlement save/reload works.
- Partner split model is captured.

Issues:

- "Break-even" currently equals total expenses. That is mathematically useful, but beta users may expect break-even tickets, break-even gross, or break-even after splits.
- "Open settlement target" on dashboard does not match settlement language on the event page.
- Partner split dollars are shown, but the basis of the split should be clearer: split of net profit/loss after expenses.
- Existing QA settlement still shows old `Production Company` partner name.

## 6. Form Validation and Trust Issues

Observed risks:

- Numeric fields accept manual input but need stronger domain validation.
- Currency inputs are plain number fields, not formatted currency fields.
- Percent fields should validate that partner A + partner B equals 100 for true 50/50 and custom split where applicable.
- Ticket tier capacity/sold/comp fields should reject negative numbers and impossible capacity math.
- Date fields should validate paid date is not before due date where relevant, or at least warn.
- Add forms are always open, which increases accidental input.
- Single-row Save and Save All coexist, which is powerful but can confuse users.
- Delete buttons are visible on every row, which creates noise even though confirmation is present.

Recommendations:

- Add inline validation summaries for failed row saves.
- Use currency formatting in display mode.
- Keep dirty state messaging near the top of the Budget tab.
- Disable single-row Save when Save All dirty state exists, or clarify whether row Save participates in local dirty state.
- Add "Last saved" or success messages that are less transient for financial actions.

## 7. Branding Consistency Findings

Current local working tree:

- Browser title: Juniper Berry Production Company
- Login page: approved horizontal logo appears
- Sidebar: approved horizontal logo appears
- Favicon/app icon metadata is present
- Old `Event Command Center` and `Desert Night Productions` strings were not found in repo search

Remaining branding/data issues:

- Existing QA settlement partner A still says "Production Company". This is database data, not a remaining code string.
- The live deployment at `production-company-gettothechorus.vercel.app` currently shows Juniper Berry text branding, but the approved logo/icon asset changes are still local working-tree changes until committed and deployed.

Infrastructure names intentionally preserved:

- Local folder: `C:\Users\azapp\OneDrive\Documents\Production Company`
- GitHub repo: `quantumboy67/production-company`
- Vercel project: `production-company`
- Supabase project/ref: `nhmhbxehgtwmqvuatawo`

## 8. Recommended Beta Scope

Recommended beta scope:

- Login
- Dashboard
- Event list
- Event detail Overview
- Budget
- Revenue / Settlement
- Ticket tiers
- Settlement save/reload

Recommended beta positioning:

"This beta focuses on event financial planning and settlement workflows. Production modules such as contacts, tasks, run of show, contracts/files, sponsorships, and shared calendars are intentionally coming later."

## 9. Recommended Items to Hide/Defer

Hide or defer before beta:

- Sidebar Contacts if scaffold-only
- Sidebar Venues if scaffold-only
- Settings if scaffold-only
- Event detail Run of Show tab
- Event detail Tasks tab
- Event detail Contacts tab
- Event detail Contracts / Files tab
- Event detail Sponsorships tab

Keep in code, but hide from primary beta navigation until the screens do real work.

## 10. Prioritized Fix List

### P0: Must Fix Before Beta

- Decide access model for live beta URL. Current live URL initially routes to Vercel auth protection unless using a Vercel share link.
- Hide or explicitly disable scaffold-only navigation and tabs.
- Commit and deploy the approved favicon/logo assets before beta if they are considered part of the beta brand.
- Add a short beta first-use note explaining that the beta is financial-workflow focused.

### P1: Should Fix Before Beta

- Rename dashboard "Open settlement target" to a clearer financial metric.
- Clean existing QA/demo data so settlement Partner A says "Juniper Berry Production Company".
- Reduce Budget and Revenue row noise by making rows read-first and edit-on-demand, or by collapsing add/edit forms.
- Clarify Estimate/Actual terminology across Budget and Revenue.
- Add validation for ticket sold/comps/capacity math.
- Add validation for partner split percentages.
- Add clearer dirty-state messaging for Save All versus single-row Save.
- Add role-readiness copy or constraints before inviting multiple beta users.

### P2: Can Wait

- Add formal audit trail.
- Add invite-only users and roles.
- Add CRM/contacts CRUD.
- Add shared venue calendar.
- Add run-of-show/task templates.
- Add contracts/files storage UI.
- Add sponsorship pipeline.
- Add exports/PDFs.
- Add advanced accounting states such as invoiced/accrued/reconciled.

## 11. Suggested Next Implementation Sprint Prompt

```text
Do not add new major product modules.

Prepare Juniper Berry Production Company Financial Alpha for beta by reducing UI noise and improving financial clarity.

Project:
C:\Users\azapp\OneDrive\Documents\Production Company

Scope:
1. Commit and deploy the approved logo/favicon assets if not already pushed.
2. Hide scaffold-only sidebar entries and event detail tabs from beta:
   - Contacts
   - Venues
   - Settings if scaffold-only
   - Run of Show
   - Tasks
   - Event Contacts
   - Contracts / Files
   - Sponsorships
3. Keep routes/code intact where useful, but remove unfinished modules from primary navigation.
4. Rename dashboard "Open settlement target" to a clearer metric.
5. Add a short beta first-use note that this beta focuses on event financial planning and settlement.
6. Rename financial labels for clarity:
   - Estimate -> Estimated
   - Actual -> Actual / Paid where appropriate
   - Clarify projected vs actual revenue language
7. Add validation for:
   - ticket sold + comps <= capacity
   - non-negative money/quantity values
   - partner split percentages totaling 100 where applicable
8. Clean existing demo/QA visible data if safe so partner names use "Juniper Berry Production Company".
9. Do not implement roles, audit trail, CRM, calendar, contracts/files, sponsorships, or storage uploads yet.
10. Run npm run lint and npm run build.
11. Verify with the dummy QA account:
   - login
   - dashboard
   - Cedric event
   - Budget Save All
   - Revenue / Settlement
   - settlement save/reload
   - logout

Return files changed, lint/build result, QA result, and whether beta users can be invited.
```

