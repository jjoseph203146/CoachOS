-- ============================================================================
-- CoachOS — private-lesson availability
--
-- Each coach sets the hours they offer private lessons on each weekday. This
-- only GUIDES booking (times outside it can still be booked deliberately,
-- exactly like a scheduling conflict); programs may run outside these hours.
--
-- Availability is per person, so a session needs to say who runs it:
-- sessions.coach_membership_id. It is what lets the app refuse to narrow
-- someone's availability underneath a lesson they already have booked.
-- ============================================================================

-- The signed-in user's own membership row.
create or replace function current_membership_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from academy_memberships where auth_user_id = auth.uid();
$$;

revoke all on function current_membership_id() from public;
grant execute on function current_membership_id() to authenticated;

create table availability_windows (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references academies (id) on delete cascade,
  membership_id  uuid not null references academy_memberships (id) on delete cascade,
  -- 0 = Sunday … 6 = Saturday. A day with no row means "unavailable".
  weekday        smallint not null check (weekday between 0 and 6),
  start_min      integer not null check (start_min between 0 and 1439),
  end_min        integer not null check (end_min between 1 and 1440),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint availability_window_ordered check (end_min > start_min),
  constraint availability_one_per_day unique (membership_id, weekday)
);

create index availability_windows_academy_idx on availability_windows (academy_id);

create trigger availability_windows_updated_at before update on availability_windows
  for each row execute function set_updated_at();

-- A window must belong to a member of the same academy.
create or replace function guard_availability_same_academy()
returns trigger
language plpgsql
as $$
declare
  v_academy uuid;
begin
  select academy_id into v_academy from academy_memberships where id = new.membership_id;
  if v_academy is distinct from new.academy_id then
    raise exception 'Membership belongs to a different academy'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger availability_windows_same_academy
  before insert or update on availability_windows
  for each row execute function guard_availability_same_academy();

alter table availability_windows enable row level security;
alter table availability_windows force row level security;

-- Everyone in the academy can see when their teammates are available; you edit
-- only your own hours.
create policy availability_select_member on availability_windows
  for select using (academy_id = current_academy_id());

create policy availability_write_own on availability_windows
  for all using (
    academy_id = current_academy_id() and membership_id = current_membership_id()
  )
  with check (
    academy_id = current_academy_id() and membership_id = current_membership_id()
  );

grant select, insert, update, delete on availability_windows to authenticated;
revoke all on availability_windows from anon;

-- Who runs the session. NULL for sessions created before this existed.
alter table sessions
  add column coach_membership_id uuid references academy_memberships (id) on delete set null;

create index sessions_coach_membership_idx on sessions (coach_membership_id)
  where coach_membership_id is not null;

-- The runner must be in the same academy as the session.
create or replace function guard_same_academy()
returns trigger
language plpgsql
as $$
declare
  v_academy uuid;
begin
  if tg_table_name = 'enrollments' then
    select academy_id into v_academy from sessions where id = new.session_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Session belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;
    select academy_id into v_academy from players where id = new.player_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Player belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'charges' then
    select academy_id into v_academy from players where id = new.player_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Player belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;
    if new.session_id is not null then
      select academy_id into v_academy from sessions where id = new.session_id;
      if v_academy is distinct from new.academy_id then
        raise exception 'Session belongs to a different academy' using errcode = 'insufficient_privilege';
      end if;
    end if;
    if new.program_id is not null then
      select academy_id into v_academy from programs where id = new.program_id;
      if v_academy is distinct from new.academy_id then
        raise exception 'Program belongs to a different academy' using errcode = 'insufficient_privilege';
      end if;
    end if;

  elsif tg_table_name = 'program_enrollments' then
    select academy_id into v_academy from programs where id = new.program_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Program belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;
    select academy_id into v_academy from players where id = new.player_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Player belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'program_price_options' then
    select academy_id into v_academy from programs where id = new.program_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Program belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'sessions' then
    if new.program_id is not null then
      select academy_id into v_academy from programs where id = new.program_id;
      if v_academy is distinct from new.academy_id then
        raise exception 'Program belongs to a different academy' using errcode = 'insufficient_privilege';
      end if;
    end if;
    if new.coach_membership_id is not null then
      select academy_id into v_academy from academy_memberships where id = new.coach_membership_id;
      if v_academy is distinct from new.academy_id then
        raise exception 'Coach belongs to a different academy' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  return new;
end;
$$;
