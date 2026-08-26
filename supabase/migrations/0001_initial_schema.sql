-- ============================================================================
-- CoachOS — initial schema
--
-- Design notes:
--  * Money is ALWAYS integer cents. No numeric/float columns for money.
--  * Financial state is DERIVED from charges/payments/credits. There is no
--    stored balance column anywhere, by design.
--  * History is preserved: players are archived/soft-deleted, charges are
--    voided rather than removed, and charge amounts are captured at creation
--    so later rate changes never rewrite the past.
--  * Every coach-owned table carries coach_id and is protected by RLS.
--
-- Safe to re-run: every statement is guarded.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----

do $$
begin
  create type session_type as enum ('private', 'group');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type session_status as enum ('scheduled', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type attendance_status as enum ('unmarked', 'present', 'absent', 'skipped');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type player_level as enum ('Beginner', 'Intermediate', 'Advanced');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type attendance_window as enum ('Same day', '24 hours', '48 hours', '72 hours');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type ui_theme as enum ('Light', 'Dark');
exception when duplicate_object then null;
end $$;

-- --------------------------------------------------------------- coaches ---

create table if not exists coaches (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid not null unique references auth.users (id) on delete cascade,
  name              text not null default '',
  email             text not null default '',
  business_name     text not null default '',
  default_rate_cents integer not null default 7000 check (default_rate_cents >= 0),
  attendance_window attendance_window not null default '24 hours',
  theme             ui_theme not null default 'Light',
  onboarded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists coaches_auth_user_id_idx on coaches (auth_user_id);

-- --------------------------------------------------------------- players ---

create table if not exists players (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references coaches (id) on delete cascade,
  name               text not null check (length(btrim(name)) > 0),
  phone              text not null default '',
  email              text not null default '',
  level              player_level not null default 'Beginner',
  -- NULL means "fall back to the coach's default rate".
  default_rate_cents integer check (default_rate_cents is null or default_rate_cents >= 0),
  notes              text not null default '',
  archived           boolean not null default false,
  -- Soft delete: history stays intact and readable.
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists players_coach_idx on players (coach_id);
create index if not exists players_coach_active_idx on players (coach_id, archived) where deleted_at is null;

-- -------------------------------------------------------------- sessions ---

create table if not exists sessions (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references coaches (id) on delete cascade,
  type               session_type not null,
  name               text not null default '',
  date               date not null,
  -- Minutes from midnight, matching the design's time model.
  start_min          integer not null check (start_min between 0 and 1439),
  duration_min       integer not null check (duration_min between 5 and 480),
  -- Per-player price captured at scheduling time.
  price_cents        integer not null default 0 check (price_cents >= 0),
  is_free            boolean not null default false,
  location           text not null default '',
  capacity           integer check (capacity is null or capacity between 2 and 12),
  status             session_status not null default 'scheduled',
  attendance_skipped boolean not null default false,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- A free session must never carry a price.
  constraint sessions_free_has_no_price check (not is_free or price_cents = 0),
  -- Private lessons have no capacity; group sessions must have one.
  constraint sessions_capacity_shape check (
    (type = 'private' and capacity is null) or (type = 'group' and capacity is not null)
  )
);

create index if not exists sessions_coach_date_idx on sessions (coach_id, date);
create index if not exists sessions_coach_status_idx on sessions (coach_id, status);

-- ----------------------------------------------------------- enrollments ---

create table if not exists enrollments (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references coaches (id) on delete cascade,
  session_id uuid not null references sessions (id) on delete cascade,
  player_id  uuid not null references players (id) on delete restrict,
  attendance attendance_status not null default 'unmarked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (session_id, player_id)
);

create index if not exists enrollments_coach_idx on enrollments (coach_id);
create index if not exists enrollments_session_idx on enrollments (session_id);
create index if not exists enrollments_player_idx on enrollments (player_id);

-- --------------------------------------------------------------- charges ---

create table if not exists charges (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references coaches (id) on delete cascade,
  player_id    uuid not null references players (id) on delete restrict,
  -- NULL for manual/ad-hoc charges.
  session_id   uuid references sessions (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  due_date     date not null,
  is_manual    boolean not null default false,
  label        text not null default '',
  note         text not null default '',
  -- Voided charges are written off: they owe nothing but remain on record.
  voided_at    timestamptz,
  void_note    text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists charges_coach_idx on charges (coach_id);
create index if not exists charges_player_idx on charges (player_id);
create index if not exists charges_session_idx on charges (session_id);
create index if not exists charges_coach_due_idx on charges (coach_id, due_date) where voided_at is null;

-- -------------------------------------------------------------- payments ---
-- Money actually received. Revenue is the sum of these — never of charges.

create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references coaches (id) on delete cascade,
  charge_id    uuid not null references charges (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  paid_on      date not null,
  note         text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists payments_coach_idx on payments (coach_id);
create index if not exists payments_charge_idx on payments (charge_id);
create index if not exists payments_coach_paid_on_idx on payments (coach_id, paid_on);

-- --------------------------------------------------------------- credits ---
-- A reduction of an obligation that is NOT money received.

create table if not exists credits (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references coaches (id) on delete cascade,
  charge_id    uuid not null references charges (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  reason       text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists credits_coach_idx on credits (coach_id);
create index if not exists credits_charge_idx on credits (charge_id);

-- ------------------------------------------------------- updated_at hook ---

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coaches_updated_at on coaches;
create trigger coaches_updated_at before update on coaches
  for each row execute function set_updated_at();
drop trigger if exists players_updated_at on players;
create trigger players_updated_at before update on players
  for each row execute function set_updated_at();
drop trigger if exists sessions_updated_at on sessions;
create trigger sessions_updated_at before update on sessions
  for each row execute function set_updated_at();
drop trigger if exists enrollments_updated_at on enrollments;
create trigger enrollments_updated_at before update on enrollments
  for each row execute function set_updated_at();
drop trigger if exists charges_updated_at on charges;
create trigger charges_updated_at before update on charges
  for each row execute function set_updated_at();
