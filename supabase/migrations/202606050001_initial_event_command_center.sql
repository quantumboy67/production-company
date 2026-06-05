create extension if not exists pgcrypto;

create type public.event_status as enum ('planning', 'confirmed', 'active', 'settled', 'cancelled');
create type public.item_status as enum ('planned', 'quoted', 'approved', 'due', 'paid', 'cancelled');
create type public.revenue_status as enum ('projected', 'confirmed', 'received');
create type public.contract_status as enum ('draft', 'sent', 'signed', 'expired', 'cancelled');
create type public.sponsorship_status as enum ('prospect', 'pitched', 'committed', 'fulfilled', 'declined');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.partner_split_type as enum ('true_50_50', 'sweat_equity', 'siloed_revenue_streams', 'custom');
create type public.file_kind as enum ('contract', 'receipt', 'settlement', 'sponsor_asset', 'rider', 'other');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  full_name text,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  indoor_capacity integer,
  outdoor_capacity integer,
  primary_contact_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  role text not null default 'other',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.venues
  add constraint venues_primary_contact_id_fkey
  foreign key (primary_contact_id) references public.contacts(id) on delete set null;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  name text not null,
  starts_on date not null,
  ends_on date,
  status public.event_status not null default 'planning',
  capacity integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (event_id, contact_id, role)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  kind public.file_kind not null default 'other',
  bucket text not null default 'event-documents',
  path text not null,
  filename text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  vendor_contact_id uuid references public.contacts(id) on delete set null,
  receipt_file_id uuid references public.files(id) on delete set null,
  cost_type text not null check (cost_type in ('hard', 'soft')),
  category text not null,
  description text not null,
  estimated_amount numeric(12,2) not null default 0,
  actual_amount numeric(12,2),
  status public.item_status not null default 'planned',
  due_date date,
  paid_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.revenue_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  source text not null,
  description text not null,
  projected_amount numeric(12,2) not null default 0,
  actual_amount numeric(12,2),
  status public.revenue_status not null default 'projected',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  capacity integer not null default 0,
  sold_quantity integer not null default 0,
  comp_quantity integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  generated_gross numeric(12,2) generated always as (price * sold_quantity) stored,
  projected_gross numeric(12,2) generated always as (price * capacity) stored
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null unique references public.events(id) on delete cascade,
  partner_split_type public.partner_split_type not null default 'true_50_50',
  partner_a_name text default 'Producer A',
  partner_b_name text default 'Producer B',
  partner_a_percent numeric(5,2) not null default 50,
  partner_b_percent numeric(5,2) not null default 50,
  notes text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  uploaded_file_id uuid references public.files(id) on delete set null,
  contract_type text not null check (contract_type in ('artist_agreement', 'co_promoter_agreement', 'venue_agreement', 'sponsor_agreement', 'vendor_agreement')),
  status public.contract_status not null default 'draft',
  deal_terms text,
  signed_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  sponsor_contact_id uuid references public.contacts(id) on delete set null,
  tier text not null check (tier in ('Title Sponsor', 'Bar Sponsor', 'In-Kind Trade', 'Custom')),
  cash_amount numeric(12,2) not null default 0,
  in_kind_value numeric(12,2) not null default 0,
  status public.sponsorship_status not null default 'prospect',
  promised_benefits text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  title text not null,
  category text not null default 'general',
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'todo',
  due_date date,
  notes text,
  template_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.run_of_show_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  item_type text not null check (item_type in ('load_in', 'soundcheck', 'doors', 'opener', 'headliner', 'curfew', 'settlement', 'other')),
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  owner_contact_id uuid references public.contacts(id) on delete set null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  cost_type text not null check (cost_type in ('hard', 'soft')),
  name text not null unique,
  sort_order integer not null default 0
);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  title text not null,
  priority public.task_priority not null default 'medium',
  sort_order integer not null default 0
);

create index on public.profiles (organization_id);
create index on public.events (organization_id, starts_on);
create index on public.contacts (organization_id, role);
create index on public.venues (organization_id);
create index on public.budget_items (organization_id, event_id, cost_type);
create index on public.revenue_items (organization_id, event_id);
create index on public.ticket_tiers (organization_id, event_id);
create index on public.tasks (organization_id, event_id, status);
create index on public.run_of_show_items (organization_id, event_id, starts_at);
create index on public.files (organization_id, event_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch_venues_updated_at before update on public.venues for each row execute function public.touch_updated_at();
create trigger touch_contacts_updated_at before update on public.contacts for each row execute function public.touch_updated_at();
create trigger touch_events_updated_at before update on public.events for each row execute function public.touch_updated_at();
create trigger touch_budget_items_updated_at before update on public.budget_items for each row execute function public.touch_updated_at();
create trigger touch_revenue_items_updated_at before update on public.revenue_items for each row execute function public.touch_updated_at();
create trigger touch_ticket_tiers_updated_at before update on public.ticket_tiers for each row execute function public.touch_updated_at();
create trigger touch_settlements_updated_at before update on public.settlements for each row execute function public.touch_updated_at();
create trigger touch_contracts_updated_at before update on public.contracts for each row execute function public.touch_updated_at();
create trigger touch_sponsorships_updated_at before update on public.sponsorships for each row execute function public.touch_updated_at();
create trigger touch_tasks_updated_at before update on public.tasks for each row execute function public.touch_updated_at();
create trigger touch_run_of_show_items_updated_at before update on public.run_of_show_items for each row execute function public.touch_updated_at();

create schema if not exists app_private;

create or replace function app_private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.organization_id
  from public.profiles
  where profiles.id = auth.uid()
$$;

grant usage on schema app_private to authenticated;
grant execute on function app_private.current_organization_id() to authenticated;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select app_private.current_organization_id()
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.contacts enable row level security;
alter table public.events enable row level security;
alter table public.event_contacts enable row level security;
alter table public.files enable row level security;
alter table public.budget_items enable row level security;
alter table public.revenue_items enable row level security;
alter table public.ticket_tiers enable row level security;
alter table public.settlements enable row level security;
alter table public.contracts enable row level security;
alter table public.sponsorships enable row level security;
alter table public.tasks enable row level security;
alter table public.run_of_show_items enable row level security;
alter table public.budget_categories enable row level security;
alter table public.task_templates enable row level security;

create policy "members can read their organization"
on public.organizations for select
using (id = app_private.current_organization_id() or created_by = auth.uid());

create policy "authenticated users can create organizations"
on public.organizations for insert
with check (created_by = auth.uid());

create policy "members can update their organization"
on public.organizations for update
using (id = app_private.current_organization_id() or created_by = auth.uid())
with check (id = app_private.current_organization_id() or created_by = auth.uid());

create policy "profiles can read organization profiles"
on public.profiles for select
using (organization_id = app_private.current_organization_id() or id = auth.uid());

create policy "profiles can update self"
on public.profiles for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and (
    organization_id = app_private.current_organization_id()
    or exists (
      select 1
      from public.organizations
      where organizations.id = profiles.organization_id
        and organizations.created_by = auth.uid()
    )
  )
);

create policy "profiles can be inserted by owner"
on public.profiles for insert
with check (
  id = auth.uid()
  and (
    organization_id is null
    or exists (
      select 1
      from public.organizations
      where organizations.id = profiles.organization_id
        and organizations.created_by = auth.uid()
    )
  )
);

create policy "read default budget categories"
on public.budget_categories for select
using (auth.role() = 'authenticated');

create policy "read default task templates"
on public.task_templates for select
using (auth.role() = 'authenticated');

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'venues', 'contacts', 'events', 'event_contacts', 'files',
    'budget_items', 'revenue_items', 'ticket_tiers', 'settlements',
    'contracts', 'sponsorships', 'tasks', 'run_of_show_items'
  ]
  loop
    execute format('create policy "members can read org rows" on public.%I for select using (organization_id = app_private.current_organization_id())', table_name);
    execute format('create policy "members can insert org rows" on public.%I for insert with check (organization_id = app_private.current_organization_id())', table_name);
    execute format('create policy "members can update org rows" on public.%I for update using (organization_id = app_private.current_organization_id()) with check (organization_id = app_private.current_organization_id())', table_name);
    execute format('create policy "members can delete org rows" on public.%I for delete using (organization_id = app_private.current_organization_id())', table_name);
  end loop;
end $$;

insert into public.budget_categories (cost_type, name, sort_order) values
('hard', 'Talent', 10),
('hard', 'Headliner Guarantee', 20),
('hard', 'Support Act', 30),
('hard', 'Production', 40),
('hard', 'Production Labor', 50),
('hard', 'Backline', 60),
('hard', 'Operations', 70),
('hard', 'Insurance', 80),
('hard', 'Permits', 90),
('hard', 'Staffing', 100),
('hard', 'Security', 110),
('hard', 'Crowd Control', 120),
('soft', 'Marketing', 10),
('soft', 'Social Media Ads', 20),
('soft', 'Graphic Design', 30),
('soft', 'Print Posters', 40),
('soft', 'Radio/PR', 50),
('soft', 'Hospitality', 60),
('soft', 'Hotel', 70),
('soft', 'Meals', 80),
('soft', 'Green Room Rider', 90),
('soft', 'Ground Transportation', 100),
('soft', 'Runner', 110),
('soft', 'Miscellaneous', 120),
('soft', 'Contingency', 130);

insert into public.task_templates (name, category, title, priority, sort_order) values
('30-day marketing sprint', 'marketing', 'Launch announce assets and ticket link', 'high', 10),
('30-day marketing sprint', 'marketing', 'Book radio and PR pushes', 'medium', 20),
('30-day marketing sprint', 'marketing', 'Schedule weekly social media ads', 'medium', 30),
('show advance checklist', 'advance', 'Confirm hospitality and green room rider', 'high', 10),
('show advance checklist', 'advance', 'Advance backline and production input list', 'high', 20),
('show advance checklist', 'advance', 'Collect tour manager day sheet', 'medium', 30),
('day-of-show checklist', 'production', 'Confirm load-in, soundcheck, doors, curfew', 'urgent', 10),
('day-of-show checklist', 'operations', 'Brief security, staffing, and crowd control', 'urgent', 20),
('day-of-show checklist', 'hospitality', 'Stock meals, runner plan, and green room', 'high', 30),
('settlement checklist', 'settlement', 'Reconcile ticket counts, comps, and fees', 'urgent', 10),
('settlement checklist', 'settlement', 'Collect receipts and actual expenses', 'high', 20),
('settlement checklist', 'settlement', 'Prepare partner split settlement', 'high', 30);

with org as (
  insert into public.organizations (name, slug)
  values ('Juniper Berry Production Company', 'juniper-berry-production-company')
  returning id
),
venue as (
  insert into public.venues (organization_id, name, address, indoor_capacity, outdoor_capacity, notes)
  select id, 'Fairweather', 'Phoenix, AZ', 450, 900, 'Sample venue for the MVP seed event.'
  from org
  returning id, organization_id
),
support as (
  insert into public.contacts (organization_id, name, company, role, notes)
  select organization_id, 'The Sugar Thieves', 'The Sugar Thieves', 'production', 'Phoenix support act / opening band.'
  from venue
  returning id, organization_id
),
event as (
  insert into public.events (organization_id, venue_id, name, starts_on, ends_on, status, capacity, notes)
  select organization_id, id, 'Cedric Burnside @ Fairweather', '2026-09-18', '2026-09-19', 'planning'::public.event_status, 900, 'Two-night event seed record.'
  from venue
  returning id, organization_id
)
insert into public.event_contacts (organization_id, event_id, contact_id, role, notes)
select event.organization_id, event.id, support.id, 'support act', 'Opening band: The Sugar Thieves from Phoenix.'
from event, support;

with event as (
  select id, organization_id from public.events where name = 'Cedric Burnside @ Fairweather'
)
insert into public.budget_items (organization_id, event_id, cost_type, category, description, estimated_amount, actual_amount, status, notes)
select organization_id, id, 'hard', 'Headliner Guarantee', 'Cedric Burnside headliner guarantee', 10000, null::numeric, 'approved'::public.item_status, 'Seeded guarantee.'
from event
union all select organization_id, id, 'hard', 'Support Act', 'The Sugar Thieves opening band', 1500, null::numeric, 'planned'::public.item_status, 'Phoenix support act.' from event
union all select organization_id, id, 'hard', 'Production', 'PA, lights, stage package', 4200, null::numeric, 'quoted'::public.item_status, null from event
union all select organization_id, id, 'hard', 'Production Labor', 'Stagehands and audio engineer', 2200, null::numeric, 'quoted'::public.item_status, null from event
union all select organization_id, id, 'hard', 'Backline', 'Drum kit and amps', 900, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'hard', 'Security', 'Door and floor security', 1800, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'hard', 'Insurance', 'Event liability policy', 650, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'soft', 'Marketing', 'Campaign management', 1200, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'soft', 'Social Media Ads', 'Paid social ads', 1600, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'soft', 'Graphic Design', 'Poster and digital assets', 450, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'soft', 'Print Posters', 'Street team print run', 350, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'soft', 'Hotel', 'Artist lodging', 1100, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'soft', 'Meals', 'Artist and crew meals', 650, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'soft', 'Green Room Rider', 'Hospitality rider', 500, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'soft', 'Ground Transportation', 'Airport and hotel transportation', 500, null::numeric, 'planned'::public.item_status, null from event
union all select organization_id, id, 'soft', 'Contingency', 'Unplanned costs', 1000, null::numeric, 'planned'::public.item_status, null from event;

with event as (
  select id, organization_id from public.events where name = 'Cedric Burnside @ Fairweather'
)
insert into public.ticket_tiers (organization_id, event_id, name, price, capacity, sold_quantity, comp_quantity, notes)
select organization_id, id, 'GA', 35, 700, 0, 20, 'General admission' from event
union all select organization_id, id, 'VIP 4-top tables', 280, 50, 0, 0, 'VIP table package, 4 guests per table' from event;

with event as (
  select id, organization_id from public.events where name = 'Cedric Burnside @ Fairweather'
)
insert into public.revenue_items (organization_id, event_id, source, description, projected_amount, status)
select organization_id, id, 'bar_bounty', 'Bar bounty estimate', 2500, 'projected'::public.revenue_status from event
union all select organization_id, id, 'merch_split', 'Merchandise split estimate', 1200, 'projected'::public.revenue_status from event
union all select organization_id, id, 'sponsorship', 'Local sponsor target', 5000, 'projected'::public.revenue_status from event;

with event as (
  select id, organization_id from public.events where name = 'Cedric Burnside @ Fairweather'
)
insert into public.settlements (organization_id, event_id, partner_split_type, partner_a_name, partner_b_name, partner_a_percent, partner_b_percent, notes)
select organization_id, id, 'true_50_50'::public.partner_split_type, 'Juniper Berry Production Company', 'Venue Partner', 50, 50, 'Default true 50/50 split.'
from event;

grant usage on schema public to anon, authenticated;
grant select on public.budget_categories, public.task_templates to authenticated;
grant select, insert, update, delete on
  public.organizations,
  public.profiles,
  public.events,
  public.venues,
  public.contacts,
  public.event_contacts,
  public.budget_items,
  public.revenue_items,
  public.ticket_tiers,
  public.settlements,
  public.contracts,
  public.sponsorships,
  public.tasks,
  public.run_of_show_items,
  public.files
to authenticated;

insert into storage.buckets (id, name, public)
values ('event-documents', 'event-documents', false)
on conflict (id) do nothing;

create policy "members can read private event files"
on storage.objects for select to authenticated
using (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
);

create policy "members can upload private event files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
);

create policy "members can update private event files"
on storage.objects for update to authenticated
using (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
)
with check (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
);

create policy "members can delete private event files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'event-documents'
  and split_part(name, '/', 1)::uuid = app_private.current_organization_id()
);
