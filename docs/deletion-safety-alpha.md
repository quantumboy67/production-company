# Deletion Safety + Restore Alpha

Deletion in the app means archive/soft-delete where practical. Archived records are removed from normal active views and totals, but preserved for audit history and Admin/Owner restore.

## Inventory

| Record type | Current behavior before alpha | New desired behavior | Restore behavior | Audit event |
| --- | --- | --- | --- | --- |
| Event | Hard delete from `events`, cascading related event records | Owner/Admin archive with confirmation and optional reason | Owner/Admin restore from Events list with `Include archived` enabled | `event.deleted`, `event.restored` |
| Budget item | Hard delete from `budget_items` | Owner/Admin archive with confirmation and optional reason; Producer can edit but not delete | Owner/Admin restore from Budget tab archived section | `budget_item.deleted`, `budget_item.restored` |
| Revenue item | Hard delete from `revenue_items` | Owner/Admin archive with confirmation and optional reason; Producer can edit but not delete | Owner/Admin restore from Revenue / Settlement tab archived section | `revenue_item.deleted`, `revenue_item.restored` |
| Ticket tier | Hard delete from `ticket_tiers` | Owner/Admin archive with confirmation and optional reason; Producer can edit but not delete | Owner/Admin restore from Revenue / Settlement tab archived section | `ticket_tier.deleted`, `ticket_tier.restored` |
| Team member | Status update to `removed` with `deactivated_at` | Owner/Admin remove with confirmation; Admin cannot remove Owners; last Owner protected | No direct restore button in alpha; re-invite/reactivate flow remains the restore path | `team_member.removed` |
| Settlements | No delete/reset action found | No deletion behavior added | Not applicable | Not applicable |
| Contacts / venues | No active delete controls found | No deletion behavior added | Not applicable | Not applicable |
| Files/storage | No app file delete UI found; storage RLS allows Admin file deletion for future file workflows | No UI deletion behavior added in this alpha | Not applicable | Future file workflow must audit delete/restore |

## Data Model

Soft-delete metadata was added to `events`, `budget_items`, `revenue_items`, and `ticket_tiers`:

- `deleted_at`
- `deleted_by`
- `delete_reason`
- `restored_at`
- `restored_by`

`organization_members` keeps its existing `status` and `deactivated_at` model as the soft-delete equivalent.

## Active Views

Normal dashboard, events, event detail, budget, revenue, ticket tier, and settlement totals exclude rows where `deleted_at` is not null.

Admin/Owner restore surfaces can include archived rows:

- Events list: `Include archived`
- Event Budget tab: `Archived budget items`
- Event Revenue / Settlement tab: `Archived revenue records`

The migration also removes direct authenticated hard-delete policies for the protected app-owned tables and adds a database trigger that blocks archive metadata changes unless the active membership is Owner/Admin. Trusted server-side `service_role` operations are allowed for maintenance and server actions, but the service-role key must remain server-only.

## Hard-Delete Exceptions

No active app-owned delete action intentionally hard-deletes records after this alpha.

Database foreign keys still use cascading deletes for organization-level cleanup and relational integrity. Those are not exposed as ordinary app delete controls in this alpha.
