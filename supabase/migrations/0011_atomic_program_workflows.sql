-- ============================================================================
-- CoachOS — atomic program workflows
--
-- Creating a program, and enrolling a participant, are each several writes. The
-- application talks to Postgres through PostgREST, which has no client-side
-- transaction, and nothing here can be undone by deleting (programs, roster
-- places and charges are history: no DELETE for anyone). So a failure part-way
-- through would leave a half-made program, or a roster place with no charge.
--
-- These two functions make each workflow ONE statement, and therefore one
-- transaction: everything commits, or nothing does.
--
-- They are deliberately SECURITY INVOKER. They run as the calling user, so row
-- level security and every guard trigger from 0006–0010 apply exactly as they
-- would to the individual inserts — only the owner can create a program or
-- agree a custom price; an agreement must match its price option; a program
-- charge must equal the participant's agreed price. The application still
-- decides WHAT to write (dates, agreement, charge period); these functions only
-- write it atomically.
-- ============================================================================

-- ─────────────────────────────────────────────────────────── create_program ─
--
--   p_program  {name, audience, weekdays[], start_min, duration_min, location,
--               capacity, age_range, starts_on, ends_on}
--   p_options  [{label, basis, amount_cents}, …]   (position = array order)
--   p_dates    the occurrence dates to schedule now
--
-- Returns the new program's id.

create or replace function create_program(p_program jsonb, p_options jsonb, p_dates date[])
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_academy  uuid := current_academy_id();
  v_program  uuid;
  v_option   jsonb;
  v_position integer := 0;
  v_date     date;
begin
  if v_academy is null then
    raise exception 'Not signed in to an academy' using errcode = 'insufficient_privilege';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) = 0 then
    raise exception 'A program needs at least one price option' using errcode = 'check_violation';
  end if;

  insert into programs
    (academy_id, name, audience, weekdays, start_min, duration_min,
     location, capacity, age_range, starts_on, ends_on)
  values (
    v_academy,
    p_program ->> 'name',
    (p_program ->> 'audience')::program_audience,
    array(select v::smallint from jsonb_array_elements_text(p_program -> 'weekdays') as t(v)),
    (p_program ->> 'start_min')::integer,
    (p_program ->> 'duration_min')::integer,
    coalesce(p_program ->> 'location', ''),
    (p_program ->> 'capacity')::integer,
    coalesce(p_program ->> 'age_range', ''),
    (p_program ->> 'starts_on')::date,
    (p_program ->> 'ends_on')::date
  )
  returning id into v_program;

  for v_option in select * from jsonb_array_elements(p_options) loop
    insert into program_price_options (academy_id, program_id, label, basis, amount_cents, position)
    values (
      v_academy,
      v_program,
      v_option ->> 'label',
      (v_option ->> 'basis')::price_basis,
      (v_option ->> 'amount_cents')::integer,
      v_position
    );
    v_position := v_position + 1;
  end loop;

  -- A program's occurrences are unpriced group sessions: participants are
  -- charged from their agreements, not from the session.
  foreach v_date in array coalesce(p_dates, '{}'::date[]) loop
    insert into sessions
      (academy_id, type, name, date, start_min, duration_min, price_cents, is_free,
       location, capacity, program_id)
    values (
      v_academy,
      'group',
      p_program ->> 'name',
      v_date,
      (p_program ->> 'start_min')::integer,
      (p_program ->> 'duration_min')::integer,
      0,
      false,
      coalesce(p_program ->> 'location', ''),
      (p_program ->> 'capacity')::integer,
      v_program
    );
  end loop;

  return v_program;
end;
$$;

revoke all on function create_program(jsonb, jsonb, date[]) from public, anon;
grant execute on function create_program(jsonb, jsonb, date[]) to authenticated;

-- ───────────────────────────────────────────────────────── enroll_participant ─
--
--   p_enrollment  {program_id, player_id, joined_on, price_option_id, agreed_label,
--                  agreed_basis, agreed_amount_cents, standard_amount_cents,
--                  agreement_source, agreement_note}
--   p_session_ids the program's upcoming occurrences to put them on (expected)
--   p_charge      the first charge, or null when nothing is owed yet
--                 {amount_cents, price_source, price_basis, standard_amount_cents,
--                  period_start, period_end, due_date, label, note}
--
-- The roster place (with its agreement snapshot), the occurrences and the first
-- charge are written together. Returns {enrollment_id, charge_id}.

create or replace function enroll_participant(
  p_enrollment  jsonb,
  p_session_ids uuid[],
  p_charge      jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_academy uuid := current_academy_id();
  v_program uuid := (p_enrollment ->> 'program_id')::uuid;
  v_player  uuid := (p_enrollment ->> 'player_id')::uuid;
  v_enr     uuid;
  v_charge  uuid;
  v_session uuid;
begin
  if v_academy is null then
    raise exception 'Not signed in to an academy' using errcode = 'insufficient_privilege';
  end if;

  insert into program_enrollments
    (academy_id, program_id, player_id, joined_on, price_option_id, agreed_label,
     agreed_basis, agreed_amount_cents, standard_amount_cents, agreement_source,
     agreement_note)
  values (
    v_academy,
    v_program,
    v_player,
    (p_enrollment ->> 'joined_on')::date,
    (p_enrollment ->> 'price_option_id')::uuid,
    p_enrollment ->> 'agreed_label',
    (p_enrollment ->> 'agreed_basis')::price_basis,
    (p_enrollment ->> 'agreed_amount_cents')::integer,
    (p_enrollment ->> 'standard_amount_cents')::integer,
    (p_enrollment ->> 'agreement_source')::agreement_source,
    coalesce(p_enrollment ->> 'agreement_note', '')
  )
  returning id into v_enr;

  foreach v_session in array coalesce(p_session_ids, '{}'::uuid[]) loop
    if not exists (select 1 from sessions where id = v_session and program_id = v_program) then
      raise exception 'Session % is not part of this program', v_session
        using errcode = 'check_violation';
    end if;
    insert into enrollments (academy_id, session_id, player_id, expected)
    values (v_academy, v_session, v_player, true)
    on conflict (session_id, player_id) do nothing;
  end loop;

  if p_charge is not null and jsonb_typeof(p_charge) = 'object' then
    insert into charges
      (academy_id, player_id, session_id, program_id, program_enrollment_id,
       amount_cents, price_source, price_basis, standard_amount_cents,
       period_start, period_end, due_date, is_manual, label, note)
    values (
      v_academy,
      v_player,
      null,
      v_program,
      v_enr,
      (p_charge ->> 'amount_cents')::integer,
      (p_charge ->> 'price_source')::price_source,
      (p_charge ->> 'price_basis')::price_basis,
      (p_charge ->> 'standard_amount_cents')::integer,
      (p_charge ->> 'period_start')::date,
      (p_charge ->> 'period_end')::date,
      (p_charge ->> 'due_date')::date,
      false,
      coalesce(p_charge ->> 'label', ''),
      coalesce(p_charge ->> 'note', '')
    )
    returning id into v_charge;
  end if;

  return jsonb_build_object('enrollment_id', v_enr, 'charge_id', v_charge);
end;
$$;

revoke all on function enroll_participant(jsonb, uuid[], jsonb) from public, anon;
grant execute on function enroll_participant(jsonb, uuid[], jsonb) to authenticated;
