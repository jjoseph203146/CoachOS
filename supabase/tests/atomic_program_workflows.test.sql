-- ============================================================================
-- Atomic program workflows (migration 0011)
--
-- create_program()      program + price options + occurrences, all or nothing
-- enroll_participant()  roster place + agreement snapshot + occurrences +
--                       first charge, all or nothing
--
-- Every failure case measures RAW row counts (bypassing RLS) before and after a
-- deliberately failing call and requires them to be identical: a failed
-- workflow must leave nothing behind, not even a half-written row that RLS
-- happens to hide from the caller.
--
-- Any failed assertion raises, which makes psql exit non-zero.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────── helpers ────

create table t_ids   (name text primary key, id uuid not null);
create table t_marks (label text primary key, val text not null);
grant select on t_ids to authenticated;
create function t_id(p_name text) returns uuid language sql stable as
  $$ select id from t_ids where name = p_name $$;
grant execute on function t_id(text) to authenticated;

-- Raw counts across every table these workflows write to (SECURITY DEFINER, so
-- RLS cannot hide a stray row).
create function t_counts() returns text language sql security definer as $$
  select format('programs=%s options=%s program_sessions=%s places=%s session_enrollments=%s program_charges=%s',
    (select count(*) from programs),
    (select count(*) from program_price_options),
    (select count(*) from sessions where program_id is not null),
    (select count(*) from program_enrollments),
    (select count(*) from enrollments where session_id in (select id from sessions where program_id is not null)),
    (select count(*) from charges where program_id is not null))
$$;
grant execute on function t_counts() to authenticated;

create function t_mark(p_label text) returns void language sql security definer as
  $$ insert into t_marks values (p_label, t_counts()) on conflict (label) do update set val = excluded.val $$;
create function t_marked(p_label text) returns text language sql security definer as
  $$ select val from t_marks where label = p_label $$;
grant execute on function t_mark(text), t_marked(text) to authenticated;

-- Runs a statement as the CURRENT role and reports 'ok' or 'ERROR: <message>'.
create function t_try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok';
exception when others then return 'ERROR: ' || sqlerrm; end $$;
grant execute on function t_try(text) to authenticated;

create function t_check(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end $$;
grant execute on function t_check(text, boolean) to authenticated;

-- Assert a call fails with a message containing `expected` AND changes nothing.
create function t_refused(p_label text, p_sql text, p_expected text) returns void language plpgsql as $$
declare v_before text := t_counts(); v_result text := t_try(p_sql);
begin
  if v_result = 'ok' then raise exception 'FAIL: % — expected an error, but the call succeeded', p_label; end if;
  if position(lower(p_expected) in lower(v_result)) = 0 then
    raise exception 'FAIL: % — expected an error containing "%", got: %', p_label, p_expected, v_result;
  end if;
  if t_counts() <> v_before then
    raise exception 'FAIL: % — PARTIAL ROWS LEFT BEHIND. before: [%] after: [%]', p_label, v_before, t_counts();
  end if;
  raise notice 'PASS: % (refused, nothing left behind)', p_label;
end $$;
grant execute on function t_refused(text, text, text) to authenticated;

-- ──────────────────────────────────────────────────────────────── fixtures ──

-- Olivia owns the academy; Carl is a coach in it; Otto owns a different academy.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'olivia@example.com', '{"name":"Olivia"}'),
  ('c0000000-0000-0000-0000-000000000002', 'carl@example.com',   '{"name":"Carl"}'),
  ('0e000000-0000-0000-0000-000000000003', 'otto@example.com',   '{"name":"Otto"}');

-- The signup trigger gave Carl an academy of his own; make him a coach in Olivia's.
delete from academy_memberships where auth_user_id = 'c0000000-0000-0000-0000-000000000002';
delete from academies where id not in (select academy_id from academy_memberships);
insert into academy_memberships (academy_id, auth_user_id, role, name, email)
  select academy_id, 'c0000000-0000-0000-0000-000000000002', 'coach', 'Carl', 'carl@example.com'
  from academy_memberships where email = 'olivia@example.com';

insert into t_ids values
  ('olivia', 'a0000000-0000-0000-0000-000000000001'),
  ('carl',   'c0000000-0000-0000-0000-000000000002'),
  ('otto',   '0e000000-0000-0000-0000-000000000003');

insert into players (academy_id, name)
  select academy_id, 'Kid One' from academy_memberships where email = 'olivia@example.com';
insert into players (academy_id, name)
  select academy_id, 'Kid Two' from academy_memberships where email = 'olivia@example.com';
insert into players (academy_id, name)
  select academy_id, 'Kid Three' from academy_memberships where email = 'olivia@example.com';
insert into players (academy_id, name)
  select academy_id, 'Otto Kid' from academy_memberships where email = 'otto@example.com';
insert into t_ids select 'p1', id from players where name = 'Kid One';
insert into t_ids select 'p2', id from players where name = 'Kid Two';
insert into t_ids select 'p3', id from players where name = 'Kid Three';
insert into t_ids select 'pOtto', id from players where name = 'Otto Kid';

select t_check('fixtures: the coach shares the owner''s academy',
  (select count(distinct academy_id) from academy_memberships
    where email in ('olivia@example.com','carl@example.com')) = 1);

-- ═════════════════════════════════════════════════════════ create_program ═══

\echo '--- create_program: success'
set role authenticated;
select set_config('request.jwt.claim.sub', t_id('olivia')::text, false);

select create_program(
  '{"name":"Summer Camp","audience":"youth","weekdays":[1,2,3,4],"start_min":600,"duration_min":180,
    "location":"Main Courts","capacity":40,"age_range":"6-12","starts_on":"2030-06-03","ends_on":null}'::jsonb,
  '[{"label":"Weekly","basis":"weekly","amount_cents":15000},
    {"label":"Drop-in","basis":"drop_in","amount_cents":3500}]'::jsonb,
  array['2030-06-03','2030-06-04','2030-06-05']::date[]
) as program_id \gset
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into t_ids values ('camp', :'program_id');

select t_check('program row is complete',
  (select name = 'Summer Camp' and audience = 'youth' and weekdays = '{1,2,3,4}'
      and start_min = 600 and duration_min = 180 and capacity = 40 and ends_on is null
      and academy_id = (select academy_id from academy_memberships where email = 'olivia@example.com')
   from programs where id = t_id('camp')));
select t_check('both price options exist, in order',
  (select array_agg(label || '=' || amount_cents order by position) = array['Weekly=15000','Drop-in=3500']
   from program_price_options where program_id = t_id('camp')));
select t_check('all three occurrences exist as unpriced group sessions on the program',
  (select count(*) = 3 and bool_and(type = 'group' and price_cents = 0 and program_id = t_id('camp'))
   from sessions where program_id = t_id('camp')));
insert into t_ids select 'weekly', id from program_price_options where program_id = t_id('camp') and label = 'Weekly';
insert into t_ids select 'dropin', id from program_price_options where program_id = t_id('camp') and label = 'Drop-in';
insert into t_ids select 's1', id from sessions where program_id = t_id('camp') and date = '2030-06-03';
insert into t_ids select 's2', id from sessions where program_id = t_id('camp') and date = '2030-06-04';
insert into t_ids select 's3', id from sessions where program_id = t_id('camp') and date = '2030-06-05';

\echo '--- create_program: failures leave nothing behind'
set role authenticated;
select set_config('request.jwt.claim.sub', t_id('olivia')::text, false);

select t_refused('a later price option fails its check (program + first option already written)',
  $$select create_program(
      '{"name":"Bad Prices","audience":"youth","weekdays":[1],"start_min":600,"duration_min":60,"starts_on":"2030-07-01"}'::jsonb,
      '[{"label":"Good","basis":"weekly","amount_cents":100},{"label":"Negative","basis":"weekly","amount_cents":-5}]'::jsonb,
      array['2030-07-01']::date[])$$,
  'amount_cents');

select t_refused('a NULL occurrence date fails (program + options already written)',
  $$select create_program(
      '{"name":"Bad Date","audience":"youth","weekdays":[1],"start_min":600,"duration_min":60,"starts_on":"2030-07-01"}'::jsonb,
      '[{"label":"Weekly","basis":"weekly","amount_cents":100}]'::jsonb,
      array['2030-07-01', null]::date[])$$,
  'null value');

select t_refused('an unknown price basis is refused',
  $$select create_program(
      '{"name":"Bad Basis","audience":"youth","weekdays":[1],"start_min":600,"duration_min":60,"starts_on":"2030-07-01"}'::jsonb,
      '[{"label":"Weekly","basis":"fortnightly","amount_cents":100}]'::jsonb,
      array['2030-07-01']::date[])$$,
  'fortnightly');

select t_refused('no price options is refused',
  $$select create_program(
      '{"name":"No Prices","audience":"youth","weekdays":[1],"start_min":600,"duration_min":60,"starts_on":"2030-07-01"}'::jsonb,
      '[]'::jsonb, array['2030-07-01']::date[])$$,
  'at least one price option');

select t_refused('no meeting days is refused',
  $$select create_program(
      '{"name":"No Days","audience":"youth","weekdays":[],"start_min":600,"duration_min":60,"starts_on":"2030-07-01"}'::jsonb,
      '[{"label":"Weekly","basis":"weekly","amount_cents":100}]'::jsonb, array['2030-07-01']::date[])$$,
  'weekdays');

select t_refused('an end date before the start date is refused',
  $$select create_program(
      '{"name":"Backwards","audience":"youth","weekdays":[1],"start_min":600,"duration_min":60,"starts_on":"2030-07-10","ends_on":"2030-07-01"}'::jsonb,
      '[{"label":"Weekly","basis":"weekly","amount_cents":100}]'::jsonb, array['2030-07-10']::date[])$$,
  'programs_dates_ordered');

select t_refused('a program with a blank name is refused',
  $$select create_program(
      '{"name":"   ","audience":"youth","weekdays":[1],"start_min":600,"duration_min":60,"starts_on":"2030-07-01"}'::jsonb,
      '[{"label":"Weekly","basis":"weekly","amount_cents":100}]'::jsonb, array['2030-07-01']::date[])$$,
  'name');

reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo '--- create_program: authorization is the database''s, not the function''s'
set role authenticated;
select set_config('request.jwt.claim.sub', t_id('carl')::text, false);
select t_refused('a COACH cannot create a program (owner-only, by RLS)',
  $$select create_program(
      '{"name":"Coach Program","audience":"youth","weekdays":[1],"start_min":600,"duration_min":60,"starts_on":"2030-07-01"}'::jsonb,
      '[{"label":"Weekly","basis":"weekly","amount_cents":100}]'::jsonb, array['2030-07-01']::date[])$$,
  'row-level security');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select t_refused('a caller with no membership cannot create a program',
  $$select create_program(
      '{"name":"Nobody","audience":"youth","weekdays":[1],"start_min":600,"duration_min":60,"starts_on":"2030-07-01"}'::jsonb,
      '[{"label":"Weekly","basis":"weekly","amount_cents":100}]'::jsonb, array['2030-07-01']::date[])$$,
  'not signed in to an academy');
reset role;

select t_check('anon cannot even call create_program',
  (select has_function_privilege('anon', 'create_program(jsonb,jsonb,date[])', 'execute')) = false);

-- ═══════════════════════════════════════════════════════ enroll_participant ═══

\echo '--- enroll_participant: success (a COACH, at a standard option)'
set role authenticated;
select set_config('request.jwt.claim.sub', t_id('carl')::text, false);

select enroll_participant(
  jsonb_build_object(
    'program_id', t_id('camp'), 'player_id', t_id('p1'), 'joined_on', '2030-06-03',
    'price_option_id', t_id('weekly'), 'agreed_label', 'Weekly', 'agreed_basis', 'weekly',
    'agreed_amount_cents', 15000, 'standard_amount_cents', 15000,
    'agreement_source', 'program_option', 'agreement_note', ''),
  array[t_id('s1'), t_id('s2'), t_id('s3')],
  jsonb_build_object(
    'amount_cents', 15000, 'price_source', 'program_option', 'price_basis', 'weekly',
    'standard_amount_cents', 15000, 'period_start', '2030-06-03', 'period_end', '2030-06-09',
    'due_date', '2030-06-03', 'label', 'Summer Camp — Weekly', 'note', '')
) as result \gset
reset role;
select set_config('request.jwt.claim.sub', '', false);

select t_check('the place, with its agreement snapshot, exists',
  (select agreed_amount_cents = 15000 and standard_amount_cents = 15000
      and agreement_source = 'program_option' and status = 'active'
   from program_enrollments where id = (:'result'::jsonb ->> 'enrollment_id')::uuid));
select t_check('they are on all three occurrences as expected',
  (select count(*) = 3 and bool_and(expected) from enrollments where player_id = t_id('p1')
     and session_id in (t_id('s1'), t_id('s2'), t_id('s3'))));
select t_check('the first charge exists, linked to the place, copying the agreement',
  (select amount_cents = 15000 and price_source = 'program_option' and price_basis = 'weekly'
      and standard_amount_cents = 15000 and period_start = '2030-06-03' and period_end = '2030-06-09'
      and program_enrollment_id = (:'result'::jsonb ->> 'enrollment_id')::uuid
   from charges where id = (:'result'::jsonb ->> 'charge_id')::uuid));

\echo '--- enroll_participant: success without a first charge (per-session places bill on attendance)'
set role authenticated;
select set_config('request.jwt.claim.sub', t_id('olivia')::text, false);
select enroll_participant(
  jsonb_build_object(
    'program_id', t_id('camp'), 'player_id', t_id('p2'), 'joined_on', '2030-06-03',
    'price_option_id', t_id('dropin'), 'agreed_label', 'Drop-in', 'agreed_basis', 'drop_in',
    'agreed_amount_cents', 3500, 'standard_amount_cents', 3500, 'agreement_source', 'program_option'),
  array[t_id('s1')], null) as result2 \gset
reset role;
select set_config('request.jwt.claim.sub', '', false);
select t_check('a place with no charge returns a null charge id',
  (:'result2'::jsonb -> 'charge_id') = 'null'::jsonb
  and exists (select 1 from program_enrollments where player_id = t_id('p2') and status = 'active')
  and not exists (select 1 from charges where player_id = t_id('p2') and program_id is not null));

\echo '--- enroll_participant: failures leave nothing behind'
-- Another program, to prove a session from elsewhere is refused.
set role authenticated;
select set_config('request.jwt.claim.sub', t_id('olivia')::text, false);
select create_program(
  '{"name":"Other Program","audience":"adult","weekdays":[2],"start_min":1140,"duration_min":90,"starts_on":"2030-06-04"}'::jsonb,
  '[{"label":"Weekly","basis":"weekly","amount_cents":9000}]'::jsonb,
  array['2030-06-04']::date[]) as other_id \gset
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into t_ids values ('other', :'other_id');
insert into t_ids select 'sOther', id from sessions where program_id = t_id('other');

set role authenticated;
select set_config('request.jwt.claim.sub', t_id('olivia')::text, false);

select t_refused('a charge that differs from the agreement fails the guard — place and occurrences roll back',
  format($f$select enroll_participant(
      jsonb_build_object('program_id',%L,'player_id',%L,'joined_on','2030-06-03','price_option_id',%L,
        'agreed_label','Weekly','agreed_basis','weekly','agreed_amount_cents',15000,'standard_amount_cents',15000,
        'agreement_source','program_option'),
      array[%L::uuid,%L::uuid],
      jsonb_build_object('amount_cents',9000,'price_source','program_option','price_basis','weekly',
        'standard_amount_cents',15000,'due_date','2030-06-03','label','x'))$f$,
    t_id('camp'), t_id('p3'), t_id('weekly'), t_id('s1'), t_id('s2')),
  'must equal the participant');

select t_refused('a session from a DIFFERENT program is refused after an earlier session was already added',
  format($f$select enroll_participant(
      jsonb_build_object('program_id',%L,'player_id',%L,'joined_on','2030-06-03','price_option_id',%L,
        'agreed_label','Weekly','agreed_basis','weekly','agreed_amount_cents',15000,'standard_amount_cents',15000,
        'agreement_source','program_option'),
      array[%L::uuid,%L::uuid], null)$f$,
    t_id('camp'), t_id('p3'), t_id('weekly'), t_id('s1'), t_id('sOther')),
  'not part of this program');

select t_refused('enrolling the same player twice fails on the unique place — the extra occurrences and charge do not stay',
  format($f$select enroll_participant(
      jsonb_build_object('program_id',%L,'player_id',%L,'joined_on','2030-06-03','price_option_id',%L,
        'agreed_label','Weekly','agreed_basis','weekly','agreed_amount_cents',15000,'standard_amount_cents',15000,
        'agreement_source','program_option'),
      array[%L::uuid],
      jsonb_build_object('amount_cents',15000,'price_source','program_option','price_basis','weekly',
        'standard_amount_cents',15000,'period_start','2030-06-10','period_end','2030-06-16',
        'due_date','2030-06-10','label','x'))$f$,
    t_id('camp'), t_id('p1'), t_id('weekly'), t_id('s3')),
  'program_enrollments_one_active');

select t_refused('an agreement that does not match its price option is refused',
  format($f$select enroll_participant(
      jsonb_build_object('program_id',%L,'player_id',%L,'joined_on','2030-06-03','price_option_id',%L,
        'agreed_label','Weekly','agreed_basis','weekly','agreed_amount_cents',100,'standard_amount_cents',15000,
        'agreement_source','program_option'),
      array[%L::uuid], null)$f$,
    t_id('camp'), t_id('p3'), t_id('weekly'), t_id('s1')),
  'must match the price option');

select t_refused('a player from ANOTHER academy is refused',
  format($f$select enroll_participant(
      jsonb_build_object('program_id',%L,'player_id',%L,'joined_on','2030-06-03','price_option_id',%L,
        'agreed_label','Weekly','agreed_basis','weekly','agreed_amount_cents',15000,'standard_amount_cents',15000,
        'agreement_source','program_option'),
      array[%L::uuid], null)$f$,
    t_id('camp'), t_id('pOtto'), t_id('weekly'), t_id('s1')),
  'different academy');

select t_refused('a place at a price option from a DIFFERENT program is refused',
  format($f$select enroll_participant(
      jsonb_build_object('program_id',%L,'player_id',%L,'joined_on','2030-06-03',
        'price_option_id',(select id::text from program_price_options where program_id = %L),
        'agreed_label','Weekly','agreed_basis','weekly','agreed_amount_cents',9000,'standard_amount_cents',9000,
        'agreement_source','program_option'),
      array[%L::uuid], null)$f$,
    t_id('camp'), t_id('p3'), t_id('other'), t_id('s1')),
  'current price options');

-- After archiving an option it can no longer be chosen.
update program_price_options set archived_at = now() where id = t_id('dropin');
select t_refused('an ARCHIVED price option cannot be chosen',
  format($f$select enroll_participant(
      jsonb_build_object('program_id',%L,'player_id',%L,'joined_on','2030-06-03','price_option_id',%L,
        'agreed_label','Drop-in','agreed_basis','drop_in','agreed_amount_cents',3500,'standard_amount_cents',3500,
        'agreement_source','program_option'),
      array[%L::uuid], null)$f$,
    t_id('camp'), t_id('p3'), t_id('dropin'), t_id('s1')),
  'current price options');

-- A charge whose source contradicts a custom agreement.
select t_refused('a custom agreement whose charge claims the standard source fails — nothing stays',
  format($f$select enroll_participant(
      jsonb_build_object('program_id',%L,'player_id',%L,'joined_on','2030-06-03','price_option_id',%L,
        'agreed_label','Weekly','agreed_basis','weekly','agreed_amount_cents',10000,'standard_amount_cents',15000,
        'agreement_source','custom','agreement_note','sibling'),
      array[%L::uuid],
      jsonb_build_object('amount_cents',10000,'price_source','program_option','price_basis','weekly',
        'standard_amount_cents',15000,'period_start','2030-06-03','period_end','2030-06-09',
        'due_date','2030-06-03','label','x'))$f$,
    t_id('camp'), t_id('p3'), t_id('weekly'), t_id('s1')),
  'must equal the participant');

reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo '--- enroll_participant: authorization'
set role authenticated;
select set_config('request.jwt.claim.sub', t_id('carl')::text, false);
select t_refused('a COACH cannot agree a custom price — nothing is written',
  format($f$select enroll_participant(
      jsonb_build_object('program_id',%L,'player_id',%L,'joined_on','2030-06-03','price_option_id',%L,
        'agreed_label','Weekly','agreed_basis','weekly','agreed_amount_cents',10000,'standard_amount_cents',15000,
        'agreement_source','custom'),
      array[%L::uuid], null)$f$,
    t_id('camp'), t_id('p3'), t_id('weekly'), t_id('s1')),
  'custom price');
reset role;
select set_config('request.jwt.claim.sub', '', false);

set role authenticated;
select set_config('request.jwt.claim.sub', t_id('olivia')::text, false);
select enroll_participant(
  jsonb_build_object(
    'program_id', t_id('camp'), 'player_id', t_id('p3'), 'joined_on', '2030-06-03',
    'price_option_id', t_id('weekly'), 'agreed_label', 'Weekly', 'agreed_basis', 'weekly',
    'agreed_amount_cents', 10000, 'standard_amount_cents', 15000,
    'agreement_source', 'custom', 'agreement_note', 'sibling discount'),
  array[t_id('s1')],
  jsonb_build_object(
    'amount_cents', 10000, 'price_source', 'custom', 'price_basis', 'weekly',
    'standard_amount_cents', 15000, 'period_start', '2030-06-03', 'period_end', '2030-06-09',
    'due_date', '2030-06-03', 'label', 'Summer Camp — Weekly')) as result3 \gset
reset role;
select set_config('request.jwt.claim.sub', '', false);
select t_check('the OWNER can agree a custom price: place, occurrence and custom charge all written',
  (select e.agreement_source = 'custom' and e.agreed_amount_cents = 10000 and e.standard_amount_cents = 15000
      and c.price_source = 'custom' and c.amount_cents = 10000 and c.standard_amount_cents = 15000
   from program_enrollments e join charges c on c.program_enrollment_id = e.id
   where e.id = (:'result3'::jsonb ->> 'enrollment_id')::uuid)
  and exists (select 1 from enrollments where player_id = t_id('p3') and session_id = t_id('s1')));

select t_check('anon cannot even call enroll_participant',
  (select has_function_privilege('anon', 'enroll_participant(jsonb,uuid[],jsonb)', 'execute')) = false);

\echo 'ALL ATOMIC WORKFLOW TESTS PASSED'
