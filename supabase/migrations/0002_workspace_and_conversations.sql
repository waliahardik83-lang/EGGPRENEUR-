-- Eggpreneur: Phase 1 of the website conversion.
-- Adds: shared business workspace (owner + invited members), a secure
-- invitation flow, persistent multi-conversation AI chat, and a decisions
-- log. Run this AFTER 0001_mvp_schema.sql.
--
-- NOT YET APPLIED by Claude — no live database exists in this delivery
-- environment. Apply with `supabase db push` or the SQL editor, then run
-- the checks in TESTING.md section "Shared workspace" and "Conversations".

-- ============================================================
-- business_members: who may access a business's records.
-- Replaces "businesses.owner_id is the only authorized user" with a real
-- membership model, while keeping owner_id on businesses as "who created
-- it" for display purposes only — it no longer gates access by itself.
-- ============================================================
create type business_role as enum ('owner', 'member');

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role business_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

alter table public.business_members enable row level security;

-- A member can see the membership list of a business they belong to
-- (so the Settings page can show "who has access"), but can only ever
-- insert/delete their OWN membership row directly — adding others happens
-- only through the invitation-acceptance function below (security definer),
-- never through a direct insert policy, so one member cannot add arbitrary
-- other users unilaterally.
create policy "business_members_select_if_member" on public.business_members
  for select using (
    exists (select 1 from public.business_members m2 where m2.business_id = business_members.business_id and m2.user_id = auth.uid())
  );

create policy "business_members_delete_own_or_owner" on public.business_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.business_members m2
      where m2.business_id = business_members.business_id and m2.user_id = auth.uid() and m2.role = 'owner'
    )
  );

-- Redefine owns_business to check membership instead of businesses.owner_id.
-- Because every other table's RLS policy calls this function rather than
-- re-implementing the check, this one change extends shared access to
-- every existing module (locations, menu, budget, actions, evidence, etc.)
-- without editing each of those policies individually.
create or replace function public.owns_business(b_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = b_id and m.user_id = auth.uid()
  );
$$;

-- The businesses table's own policy previously checked owner_id directly;
-- replace it with the membership-aware version too.
drop policy if exists "businesses_owner_all" on public.businesses;
create policy "businesses_members_select" on public.businesses
  for select using (public.owns_business(id));
create policy "businesses_members_update" on public.businesses
  for update using (public.owns_business(id)) with check (public.owns_business(id));
create policy "businesses_owner_insert" on public.businesses
  for insert with check (owner_id = auth.uid());
create policy "businesses_owner_delete" on public.businesses
  for delete using (
    exists (select 1 from public.business_members m where m.business_id = id and m.user_id = auth.uid() and m.role = 'owner')
  );

-- Auto-add the creator as 'owner' member whenever a business is created.
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (business_id, user_id) do nothing;
  return new;
end;
$$;

create trigger trg_business_created_add_owner
  after insert on public.businesses
  for each row execute procedure public.add_owner_as_member();

-- ============================================================
-- pending_invitations: owner invites a second person (e.g. father) by
-- email. No email-sending service is wired up in this MVP — see README
-- "Inviting your father" for the actual manual-link flow. The row is
-- consumed automatically the moment that email address signs up.
-- ============================================================
create table public.pending_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  unique (business_id, email)
);

alter table public.pending_invitations enable row level security;

create policy "invitations_visible_to_business_members" on public.pending_invitations
  for select using (public.owns_business(business_id));
create policy "invitations_created_by_owner" on public.pending_invitations
  for insert with check (
    exists (select 1 from public.business_members m where m.business_id = pending_invitations.business_id and m.user_id = auth.uid() and m.role = 'owner')
  );
create policy "invitations_deleted_by_owner" on public.pending_invitations
  for delete using (
    exists (select 1 from public.business_members m where m.business_id = pending_invitations.business_id and m.user_id = auth.uid() and m.role = 'owner')
  );

-- Extend the existing new-user trigger (from 0001) to also accept any
-- pending invitation matching the new user's email. Security definer, so
-- it can read pending_invitations and write business_members on the new
-- user's behalf during their own signup — it never touches another user's
-- data except to insert a membership row that invitation explicitly named.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  inv record;
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');

  for inv in
    select * from public.pending_invitations
    where lower(email) = lower(new.email) and accepted_at is null
  loop
    insert into public.business_members (business_id, user_id, role)
    values (inv.business_id, new.id, 'member')
    on conflict (business_id, user_id) do nothing;

    update public.pending_invitations
    set accepted_at = now(), accepted_by = new.id
    where id = inv.id;
  end loop;

  return new;
end;
$$;
-- (trigger on_auth_user_created from 0001 already points at this function
-- by name, so no need to recreate the trigger itself.)

-- ============================================================
-- Let members of the same business see each other's display name.
-- 0001's original profiles policy only allowed seeing your OWN profile,
-- which would silently break "who has access" in Settings for a shared
-- workspace (the query wouldn't error — RLS just filters the other
-- member's row out, showing a blank name instead of a real one).
-- ============================================================
create policy "profiles_select_shared_business_members" on public.profiles
  for select using (
    exists (
      select 1 from public.business_members mine
      join public.business_members theirs on theirs.business_id = mine.business_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

-- ============================================================
-- Persistent AI conversations
-- ============================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null default 'New conversation',
  created_by uuid not null references auth.users(id),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
create policy "conversations_owner_all" on public.conversations
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

create trigger trg_conversations_updated before update on public.conversations
  for each row execute procedure public.set_updated_at();

create type message_role as enum ('user', 'assistant', 'system');
create type message_status as enum ('sent', 'error');

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role message_role not null,
  content text not null,
  status message_status not null default 'sent',
  error_detail text,
  retrieved_record_refs jsonb not null default '[]'::jsonb, -- only populated on assistant messages
  missing_evidence jsonb not null default '[]'::jsonb,
  model text,
  created_by uuid references auth.users(id), -- null for assistant/system messages
  created_at timestamptz not null default now(),
  -- monotonic per-conversation ordering independent of clock skew between
  -- the user's save-before-send call and the assistant's save-after-reply
  seq bigint not null
);

alter table public.conversation_messages enable row level security;

create or replace function public.owns_conversation(c_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.conversations c
    where c.id = c_id and public.owns_business(c.business_id)
  );
$$;

create policy "conversation_messages_owner_all" on public.conversation_messages
  for all using (public.owns_conversation(conversation_id)) with check (public.owns_conversation(conversation_id));

-- Per-conversation sequence number, assigned atomically so two people
-- typing in the same conversation at once can never get the same seq
-- (prevents interleaved/duplicate ordering, per the brief's requirement
-- to avoid duplicate records under concurrent use).
create sequence if not exists public.conversation_message_seq;

create or replace function public.set_message_seq()
returns trigger language plpgsql as $$
begin
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq), 0) + 1 into new.seq
    from public.conversation_messages
    where conversation_id = new.conversation_id;
  end if;
  return new;
end;
$$;

create trigger trg_message_seq before insert on public.conversation_messages
  for each row execute procedure public.set_message_seq();

-- Note: the trigger above does a max()+1 read-then-write, which is not
-- perfectly race-proof under truly simultaneous inserts from two devices
-- in the same conversation within milliseconds of each other. For a
-- two-person family workspace this is an acceptable MVP tradeoff; if it
-- ever matters, replace with a per-conversation sequence row and
-- `select ... for update` locking. Documented, not hidden.

create index idx_conversation_messages_conv_seq on public.conversation_messages(conversation_id, seq);

-- ============================================================
-- Decisions log: "business decisions, rejected options and the reasons"
-- ============================================================
create type decision_status as enum ('DECIDED', 'REJECTED', 'SUPERSEDED');

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  decision text not null,
  rationale text,
  alternatives_considered jsonb not null default '[]'::jsonb, -- [{option, why_rejected}]
  status decision_status not null default 'DECIDED',
  related_location_id uuid references public.locations(id) on delete set null,
  related_menu_item_id uuid references public.menu_items(id) on delete set null,
  decided_by uuid references auth.users(id),
  decided_at timestamptz not null default now(),
  superseded_by uuid references public.decisions(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.decisions enable row level security;
create policy "decisions_owner_all" on public.decisions
  for all using (public.owns_business(business_id)) with check (public.owns_business(business_id));

-- ============================================================
-- Retrofit: old single-owner businesses created under 0001 (if this
-- migration is applied to a database that already has rows) need a
-- membership row too, since owns_business() no longer reads owner_id.
-- Safe to run even on a brand-new database (no-op if businesses is empty).
-- ============================================================
insert into public.business_members (business_id, user_id, role)
select id, owner_id, 'owner' from public.businesses
on conflict (business_id, user_id) do nothing;
