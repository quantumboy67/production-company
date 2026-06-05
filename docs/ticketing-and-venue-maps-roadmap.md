# Ticketing And Venue Maps Roadmap

This roadmap locks the implementation order for access control, audit trail, venue maps, and TicketLeap integration.

## Guiding Principle

TicketLeap remains the ticketing source of truth.

Juniper Berry Production Company is the production planning and financial reconciliation system.

That means TicketLeap owns public checkout, live reserved seating inventory, buyer records, attendee records, refunds, and final ticketing sales reports. Juniper Berry should use ticketing data for internal planning, capacity modeling, holds/comps planning, gross potential, settlement support, and reconciliation.

## Locked Implementation Order

1. Access Control Alpha
2. Audit Trail Alpha
3. Venue Map Planning Data Model
4. TicketLeap CSV Preview Import
5. Apply Imports to Financials
6. Visual Map Builder later
7. TicketLeap API/webhooks only if confirmed

## Why Venue Maps And Imports Come Later

Venue maps and ticketing imports are financial-control surfaces. They affect:

- capacity
- holds
- comps
- sold counts
- actual gross
- settlement

Because these values can change event financials and settlement outcomes, venue maps and TicketLeap imports must come after:

- invite-only users
- role-based access
- audit trail

The goal is to know who changed financial-impacting data, what changed, when it changed, and which source file or report justified the change.

## Future TicketLeap Import Controls

TicketLeap CSV imports should include:

- who uploaded it
- source file/report
- row-level import history
- before/after values
- preview before apply
- duplicate detection
- reconciliation notes
- rollback or correction path

Imports should never silently overwrite Juniper Berry financial records. The system should preview proposed changes, require confirmation before applying them, preserve import history, and make corrections traceable.

## Sequencing Notes

Access Control Alpha should establish invite-only membership and roles before additional financial-control surfaces are added.

Audit Trail Alpha should record meaningful create, update, delete, import, and role-change activity before imports can mutate financial totals.

Venue Map Planning should start as internal capacity and gross-potential modeling. It should not duplicate TicketLeap checkout.

TicketLeap CSV Preview Import should come before any API/webhook work because CSV exports are the safest assumption until TicketLeap confirms organizer API access.

TicketLeap API/webhook sync should only be pursued if TicketLeap confirms access to private organizer data, sales summaries, ticket tier sales, attendee/order reports, reserved seating inventory, held seats, refunds, comps, voids, and webhooks.
