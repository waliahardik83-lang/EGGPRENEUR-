-- Eggpreneur MVP schema
-- Scope: items 1-8 of the delivery plan (auth, business setup/budget,
-- location comparison, ground-survey checklist, menu costing, break-even,
-- action register + evidence, AI assistant support tables).
--
-- NOT YET APPLIED to a live database by Claude. Apply with:
--   supabase db push
-- or paste into the Supabase SQL editor, in order, and verify manually.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Shared enum: evidence confidence, used everywhere a figure could be
-- mistaken for a verified fact. Every material input must carry one.
-- ============================================================
create type evidence_confidence as enum (
  'VERIFIED',       -- confirmed against an official/primary source, dated
  'USER_REPORTED',  -- the owner/family observed or was told this directly
  'ESTIMATED',      -- a calculated or AI-assisted estimate, not measured
  'UNVERIFIED'      -- placeholder; must not be used in a go/no-go decision
);

create type business_stage as enum (
  'IDEA',
  'VALIDATION',
  'SITE_SELECTION',
  'PRE_LAUNCH',
  'LAUNCHED',
  'OPERATING'
);

create type action_status as enum ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');
create type action_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- ============================================================
-- profiles: one row per authenticated user, created on signup via trigger
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- businesses: the top-level container. Everything else hangs off this.
-- A business is owned by exactly one auth user for the MVP (no
-- multi-user household sharing yet — see README "Known limitations").
-- ============================================================
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Restaurant Project',
  city text not null default 'Ambala',
  state text not null default 'Haryana',
  stage business_stage not null default 'IDEA',
  target_opening_date date,
  total_startup_budget numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.businesses enable row level security;

create policy "businesses_owner_all" on public.businesses
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Generic helper: every child table below checks ownership via the
-- business's owner_id, so RLS stays correct even though the child table
-- itself has no owner_id column.
create or replace function public.owns_business(b_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = b_id and b.owner_id = auth.uid()
  );
$$;

-- ============================================================
-- capital_budget_items (Module F / Owner Dashboard budget tracking)
-- ============================================================
create table public.capital_budget_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category text not null, -- e.g. 'Deposit', 'Renovation', 'Kitchen Equipment', 'Licences', 'Contingency'
  item text not null,
  estimated_cost numeric(12,2) not null default 0,
  actual_cost numeric(12,2),
  status text not null default 'PLANNED', -- PLANNED | COMMITTED | PAID
  evidence_confidence evidence_confidence not null default 'ESTIMATED',
  source_notes text,
  quoted_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.capital_budget_items enable row level security;
create policy "capital_budget_owner_all" on public.capital_budget_items
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

-- ============================================================
-- locations (Module B) + footfall observations (ground-survey workflow)
-- ============================================================
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  address text,
  map_link text,
  asking_rent_monthly numeric(12,2),
  security_deposit numeric(12,2),
  escalation_terms text,
  lock_in_months integer,
  area_sqft numeric(10,2),
  frontage_ft numeric(10,2),
  visibility_notes text,
  signage_restrictions text,
  ventilation_notes text,
  water_feasible boolean,
  drainage_feasible boolean,
  electricity_load_kw numeric(6,2),
  exhaust_feasible boolean,
  seating_capacity integer,
  takeaway_access boolean,
  delivery_access boolean,
  parking_notes text,
  pedestrian_access_notes text,
  road_visibility_notes text,
  demand_generators jsonb not null default '[]'::jsonb, -- [{type, name, distance_m, notes}]
  licensing_questions jsonb not null default '[]'::jsonb, -- [{question, status, answer, confirmed_by, date}]
  status text not null default 'CANDIDATE', -- CANDIDATE | SHORTLISTED | REJECTED | SELECTED
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.locations enable row level security;
create policy "locations_owner_all" on public.locations
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

create or replace function public.owns_location(l_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.locations l
    where l.id = l_id and public.owns_business(l.business_id)
  );
$$;

-- Weighted comparison criteria — configurable per business, not hardcoded,
-- so the score is explainable rather than a black box.
create table public.location_scoring_criteria (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  criterion text not null, -- e.g. 'Footfall at lunch', 'Rent affordability', 'Visibility'
  weight numeric(5,2) not null default 1, -- relative weight, not required to sum to 100
  created_at timestamptz not null default now()
);
alter table public.location_scoring_criteria enable row level security;
create policy "scoring_criteria_owner_all" on public.location_scoring_criteria
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

create table public.location_scores (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  criterion_id uuid not null references public.location_scoring_criteria(id) on delete cascade,
  score numeric(5,2) not null, -- 0-10, manually entered by the family after a visit, not AI-generated
  evidence_confidence evidence_confidence not null default 'USER_REPORTED',
  notes text,
  scored_at timestamptz not null default now(),
  unique (location_id, criterion_id)
);
alter table public.location_scores enable row level security;
create policy "location_scores_owner_all" on public.location_scores
  for all using (public.owns_location(location_id)) with check (public.owns_location(location_id));

-- Repeatable field-survey / footfall observation log
create table public.location_footfall_observations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  observed_date date not null,
  day_of_week text not null, -- Mon..Sun, denormalized for quick filtering
  time_slot text not null,   -- 'Weekday Morning', 'Weekday Lunch', 'Weekday Evening', 'Weekend'
  start_time time,
  duration_minutes integer not null,
  method text not null default 'Manual tally count', -- how counted
  pedestrian_count integer,
  vehicle_count integer,
  potential_customer_count integer, -- people who look like plausible customers, not total passersby
  observer_name text not null,
  weather_notes text,
  notes text,
  confidence evidence_confidence not null default 'USER_REPORTED',
  created_at timestamptz not null default now()
);
alter table public.location_footfall_observations enable row level security;
create policy "footfall_owner_all" on public.location_footfall_observations
  for all using (public.owns_location(location_id)) with check (public.owns_location(location_id));

-- ============================================================
-- menu_items + ingredients (Module E)
-- ============================================================
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  category text, -- Egg roll, Omelette, Bhurji, Egg curry, Rice meal, Breakfast combo, etc.
  description text,
  portion_size text,
  prep_time_minutes numeric(6,2),
  yield_qty numeric(8,2) not null default 1, -- portions produced per batch, for batch-costed items
  wastage_pct numeric(5,2) not null default 0, -- updated from measured data, not guessed
  packaging_cost numeric(10,2) not null default 0,
  dine_in_price numeric(10,2),
  takeaway_price numeric(10,2),
  delivery_price numeric(10,2),
  tax_pct numeric(5,2) not null default 5, -- GST on restaurant services, VERIFY current rate — see compliance module
  delivery_platform_fee_pct numeric(5,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.menu_items enable row level security;
create policy "menu_items_owner_all" on public.menu_items
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

create table public.menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  ingredient_name text not null, -- e.g. 'Egg (large)', 'Refined oil', 'Pav bread'
  quantity numeric(10,3) not null,
  unit text not null, -- g, ml, pc, etc.
  unit_cost numeric(10,4) not null, -- cost per unit, from a dated quotation
  last_quote_date date,
  supplier_name text,
  evidence_confidence evidence_confidence not null default 'USER_REPORTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.menu_item_ingredients enable row level security;
create or replace function public.owns_menu_item(m_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.menu_items m
    where m.id = m_id and public.owns_business(m.business_id)
  );
$$;
create policy "menu_ingredients_owner_all" on public.menu_item_ingredients
  for all using (public.owns_menu_item(menu_item_id)) with check (public.owns_menu_item(menu_item_id));

-- ============================================================
-- financial_scenarios (Module F break-even inputs, saved snapshots)
-- ============================================================
create table public.financial_scenarios (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  scenario_name text not null default 'base', -- conservative | base | optimistic | custom
  fixed_costs_monthly numeric(12,2) not null default 0, -- rent+salaries+utilities+maintenance+marketing etc.
  avg_bill numeric(10,2) not null default 0,
  avg_variable_cost_pct numeric(5,2) not null default 0, -- blended food+packaging cost as % of sale, from menu data
  orders_per_day numeric(8,2) not null default 0,
  operating_days_per_month integer not null default 26,
  owner_compensation_monthly numeric(12,2) not null default 0,
  debt_repayment_monthly numeric(12,2) not null default 0,
  contingency_pct numeric(5,2) not null default 10,
  assumptions jsonb not null default '{}'::jsonb, -- free-form notes on each assumption's source/confidence
  created_at timestamptz not null default now()
);
alter table public.financial_scenarios enable row level security;
create policy "financial_scenarios_owner_all" on public.financial_scenarios
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

-- ============================================================
-- actions (Module: register used across every module) + evidence files
-- ============================================================
create table public.actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  module text not null, -- 'Location', 'Menu', 'Finance', 'Compliance', 'Demand', 'Operations', 'Marketing', 'General'
  title text not null,
  description text,
  responsible_person text not null,
  deadline date,
  status action_status not null default 'OPEN',
  priority action_priority not null default 'MEDIUM',
  estimated_cost numeric(12,2),
  success_criterion text not null,
  related_location_id uuid references public.locations(id) on delete set null,
  related_menu_item_id uuid references public.menu_items(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.actions enable row level security;
create policy "actions_owner_all" on public.actions
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

create table public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  related_table text not null, -- which table this evidence supports, e.g. 'locations', 'actions'
  related_id uuid not null,
  storage_path text not null, -- path inside the 'evidence' storage bucket
  file_name text not null,
  file_type text,
  description text,
  evidence_confidence evidence_confidence not null default 'USER_REPORTED',
  observed_date date,
  uploaded_at timestamptz not null default now()
);
alter table public.evidence_files enable row level security;
create policy "evidence_files_owner_all" on public.evidence_files
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

-- ============================================================
-- ai_consultant_logs: every AI answer is stored with the record IDs it
-- actually retrieved, so "cite your sources" is auditable, not a promise.
-- ============================================================
create table public.ai_consultant_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  asked_by uuid not null references auth.users(id),
  question text not null,
  retrieved_record_refs jsonb not null default '[]'::jsonb, -- [{table, id}] actually fetched before answering
  missing_evidence jsonb not null default '[]'::jsonb,       -- what the AI flagged as not available
  answer text not null,
  model text not null,
  created_at timestamptz not null default now()
);
alter table public.ai_consultant_logs enable row level security;
create policy "ai_logs_owner_all" on public.ai_consultant_logs
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

-- ============================================================
-- updated_at maintenance trigger (generic)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_businesses_updated before update on public.businesses
  for each row execute procedure public.set_updated_at();
create trigger trg_capital_budget_updated before update on public.capital_budget_items
  for each row execute procedure public.set_updated_at();
create trigger trg_locations_updated before update on public.locations
  for each row execute procedure public.set_updated_at();
create trigger trg_menu_items_updated before update on public.menu_items
  for each row execute procedure public.set_updated_at();
create trigger trg_menu_ingredients_updated before update on public.menu_item_ingredients
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Storage bucket for evidence (photos, quotations, invoices)
-- Private by default; access controlled by policies below.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

create policy "evidence_bucket_owner_select" on storage.objects
  for select using (
    bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "evidence_bucket_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "evidence_bucket_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Upload convention enforced in application code (src/lib/evidence.ts):
-- storage path = `${auth.uid()}/${business_id}/${related_table}/${filename}`
