-- Index archive/restore metadata foreign keys flagged by Supabase advisors.
create index if not exists events_deleted_by_idx on public.events (deleted_by);
create index if not exists events_restored_by_idx on public.events (restored_by);

create index if not exists budget_items_deleted_by_idx on public.budget_items (deleted_by);
create index if not exists budget_items_restored_by_idx on public.budget_items (restored_by);

create index if not exists revenue_items_deleted_by_idx on public.revenue_items (deleted_by);
create index if not exists revenue_items_restored_by_idx on public.revenue_items (restored_by);

create index if not exists ticket_tiers_deleted_by_idx on public.ticket_tiers (deleted_by);
create index if not exists ticket_tiers_restored_by_idx on public.ticket_tiers (restored_by);
