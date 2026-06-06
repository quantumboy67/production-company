# Juniper Berry Product Roadmap

This roadmap captures near-term implementation order for future Juniper Berry Production Company modules without adding unfinished product behavior to the beta app.

## Guiding Principle

The financial beta path stays primary:

Dashboard -> Calendar -> Event -> Budget / Revenue & Settlement.

Future modules should not weaken organization scoping, role checks, RLS, or auditability. Features that affect financial records, access, documents, imports, or settlement readiness must be role-aware and traceable before they can become active workflows.

## Locked Implementation Order

1. Access Control Alpha
2. Audit Trail Alpha
3. My Team Alpha
4. Receipts & Invoices
5. My Auditor
6. Venue Maps / TicketLeap CSV Import later

## Future Module Definitions

### My Team

My Team is now a functional alpha directory for Juniper Berry members and production collaborators. It shows people directly associated with the production company, their roles, membership status, invited dates, and basic account readiness.

This is separate from Settings -> Team. Settings -> Team remains the admin and user management area for invite-only access control.

My Team is read-oriented. Owners/Admins can link from My Team to Settings -> Team when they need invite, role-change, password reset, or removal controls.

### My Contacts

My Contacts will become the broader CRM-style contact database for artists, agents, managers, tour managers, venues, sponsors, media, vendors, security, hospitality, hotels, restaurants, photographers, engineers, insurance, city/permit contacts, and co-promoters.

My Contacts remains future CRM work. My Team members should automatically appear in My Contacts later, but the CRM should remain broader than internal membership.

Future contact fields may include name, company, role/title, email, phone, website, socials, birthday, important dates, notes, relationship type, tags, last contacted, next follow-up, event history, and reminder/tickler fields.

### Receipts & Invoices

Receipts & Invoices will attach financial documents to budget and expense items. Future documents may include receipts, vendor invoices, quotes, W-9s, certificates of insurance, contracts, and settlement support.

This module touches financial controls because it changes how expenses are supported, marked complete, and reviewed. It should use private Supabase Storage and should not be implemented until role-aware and auditable behavior is ready.

### My Auditor

My Auditor will become the system review and readiness layer. It should not be built until after Access Control Alpha, Audit Trail Alpha, Receipts & Invoices, and enough structured data exists to review.

Future checks may include missing receipts, missing invoices, unpaid invoices, expenses with actuals but no receipt, paid invoices without payment dates, budget items missing vendors, ticket sales/revenue inconsistencies, settlement mismatches, missing contracts, missing W-9s, incomplete event financials, stale follow-ups, overdue tasks, role/access anomalies, imported TicketLeap data that does not reconcile, duplicate contacts, and missing audit trail records.

## Financial-Control Dependencies

Receipts & Invoices and My Auditor are financial-control surfaces. They can affect:

- expense completeness
- settlement readiness
- vendor/payment follow-up
- document support
- financial exception review
- audit confidence

Because of that, they must come after:

- invite-only users
- role-based access
- audit trail

The goal is to know who changed financial-impacting data, what changed, when it changed, and which source document or workflow justified the change.

## Ticketing And Venue Maps Relationship

Venue maps and TicketLeap imports remain later work. TicketLeap remains the ticketing source of truth, and Juniper Berry remains the production planning and financial reconciliation system.

TicketLeap CSV import and venue map planning should wait until access control and audit trail are stable because they can affect capacity, holds, comps, sold counts, actual gross, and settlement.
