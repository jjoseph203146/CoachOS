-- ============================================================================
-- CoachOS — development seed data
--
-- DEVELOPMENT ONLY. Do not run against a production project.
--
-- Prerequisites: sign up in the app first so an auth user and its academy
-- membership exist. Then set the email below and run this whole file in the Supabase SQL
-- editor.
--
-- The data mirrors lib/data/mock/seed.ts and deliberately exercises every UI
-- state: upcoming and past sessions, present/absent/unmarked/skipped
-- attendance, paid, unpaid, overdue, partially paid, fully credited and voided
-- charges, a free session, a cancelled session and an archived player.
-- All dates are relative to today, so the demo never goes stale.
-- ============================================================================

do $$
declare
  -- >>> CHANGE THIS to the email you signed up with <<<
  v_email text := 'you@example.com';

  v_academy uuid;
  v_today date := current_date;

  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid; s7 uuid;
  s8 uuid; s9 uuid; s10 uuid; s11 uuid; s12 uuid; s13 uuid; s14 uuid;
  c_tmp uuid;
begin
  select m.academy_id into v_academy
    from academy_memberships m
    join auth.users u on u.id = m.auth_user_id
   where u.email = v_email;

  if v_academy is null then
    raise exception 'No academy found for %. Sign up in the app first, then set v_email.', v_email;
  end if;

  -- Idempotent: clear any previous seed for this academy.
  delete from credits  where academy_id = v_academy;
  delete from payments where academy_id = v_academy;
  delete from charges  where academy_id = v_academy;
  delete from enrollments where academy_id = v_academy;
  delete from sessions where academy_id = v_academy;
  delete from players  where academy_id = v_academy;

  update academies
     set business_name = coalesce(nullif(business_name, ''), 'Peak Performance Tennis'),
         default_rate_cents = 7000
   where id = v_academy;

  update academy_memberships
     set onboarded_at = coalesce(onboarded_at, now())
   where academy_id = v_academy and role = 'owner';

  -- ---- players ----
  insert into players (academy_id, name, level, default_rate_cents, phone, email, notes, archived)
  values
    (v_academy, 'Maya Okonkwo',    'Intermediate', 7500, '(415) 555-0114', 'maya.o@example.com',   'Working on two-handed backhand consistency. Serve toss drifting right — film it next session.', false),
    (v_academy, 'Marcus Johnson',  'Advanced',     9000, '(415) 555-0182', 'marcus.j@example.com', 'Prepping for the Labor Day open. Focus: return depth and net transitions.', false),
    (v_academy, 'Sophia Williams', 'Beginner',     6000, '(415) 555-0139', 'sophia.w@example.com', 'New to the game — keep drills short and fun. Eastern forehand grip.', false),
    (v_academy, 'Daniel Brown',    'Intermediate', 7500, '(415) 555-0167', 'daniel.b@example.com', 'Footwork ladder warmups. Wears a knee brace — avoid extended lateral drills.', false),
    (v_academy, 'Ethan Davis',     'Advanced',     9000, '(415) 555-0158', 'ethan.d@example.com',  'College recruiting tape in September. Building serve +1 patterns.', false),
    (v_academy, 'Olivia Carter',   'Beginner',     6000, '(415) 555-0121', 'olivia.c@example.com', 'Second month. Building rally tolerance — 10-ball goal.', false),
    (v_academy, 'Liam Foster',     'Intermediate', 7000, '(415) 555-0175', 'liam.f@example.com',   'Moved across town in June.', true);

  select id into p1 from players where academy_id = v_academy and name = 'Maya Okonkwo';
  select id into p2 from players where academy_id = v_academy and name = 'Marcus Johnson';
  select id into p3 from players where academy_id = v_academy and name = 'Sophia Williams';
  select id into p4 from players where academy_id = v_academy and name = 'Daniel Brown';
  select id into p5 from players where academy_id = v_academy and name = 'Ethan Davis';
  select id into p6 from players where academy_id = v_academy and name = 'Olivia Carter';
  select id into p7 from players where academy_id = v_academy and name = 'Liam Foster';

  -- ---- sessions ----
  insert into sessions (academy_id, type, name, date, start_min, duration_min, price_cents, is_free, location, capacity, status, attendance_skipped, cancelled_at)
  values
    (v_academy, 'private', 'Maya Okonkwo Private Lesson',   v_today,           960,  60, 7500, false, 'Court 2',    null, 'scheduled', false, null),
    (v_academy, 'group',   'Sunday Evening Group',          v_today,          1080,  90, 3500, false, 'Court 1',       6, 'scheduled', false, null),
    (v_academy, 'private', 'Marcus Johnson Private Lesson', v_today,           540,  60, 9000, false, 'Court 2',    null, 'scheduled', false, null),
    (v_academy, 'group',   'Wednesday Drills',              v_today -  3,     1020,  90, 3500, false, 'Main Court',    6, 'scheduled', false, null),
    (v_academy, 'private', 'Sophia Williams Private Lesson',v_today -  2,      600,  60, 6000, false, 'Court 3',    null, 'scheduled', false, null),
    (v_academy, 'private', 'Ethan Davis Private Lesson',    v_today -  4,     1080,  60, 9000, false, 'Court 2',    null, 'scheduled', false, null),
    (v_academy, 'group',   'Tuesday Group',                 v_today +  2,     1020,  90, 3500, false, 'Court 1',       6, 'cancelled', false, now()),
    (v_academy, 'private', 'Olivia Carter Private Lesson',  v_today +  1,      600,  45,    0, true,  'Court 1',    null, 'scheduled', false, null),
    (v_academy, 'group',   'Wednesday Drills',              v_today +  3,     1020,  90, 3500, false, 'Main Court',    6, 'scheduled', false, null),
    (v_academy, 'private', 'Daniel Brown Private Lesson',   v_today +  4,     1020,  60, 7500, false, 'Court 3',    null, 'scheduled', false, null),
    (v_academy, 'group',   'Saturday Group Session',        v_today +  6,      570, 120,    0, true,  'Main Court',    6, 'scheduled', false, null),
    (v_academy, 'private', 'Maya Okonkwo Private Lesson',   v_today +  8,      960,  60, 7500, false, 'Court 2',    null, 'scheduled', false, null),
    (v_academy, 'private', 'Maya Okonkwo Private Lesson',   v_today -  7,      960,  60, 7500, false, 'Court 2',    null, 'scheduled', true,  null),
    (v_academy, 'group',   'Saturday Group Session',        v_today -  7,      570, 120, 3500, false, 'Main Court',    6, 'scheduled', false, null);

  select id into s1  from sessions where academy_id = v_academy and date = v_today     and start_min =  960;
  select id into s2  from sessions where academy_id = v_academy and date = v_today     and start_min = 1080;
  select id into s3  from sessions where academy_id = v_academy and date = v_today     and start_min =  540;
  select id into s4  from sessions where academy_id = v_academy and date = v_today - 3 and start_min = 1020;
  select id into s5  from sessions where academy_id = v_academy and date = v_today - 2 and start_min =  600;
  select id into s6  from sessions where academy_id = v_academy and date = v_today - 4 and start_min = 1080;
  select id into s7  from sessions where academy_id = v_academy and date = v_today + 2 and start_min = 1020;
  select id into s8  from sessions where academy_id = v_academy and date = v_today + 1 and start_min =  600;
  select id into s9  from sessions where academy_id = v_academy and date = v_today + 3 and start_min = 1020;
  select id into s10 from sessions where academy_id = v_academy and date = v_today + 4 and start_min = 1020;
  select id into s11 from sessions where academy_id = v_academy and date = v_today + 6 and start_min =  570;
  select id into s12 from sessions where academy_id = v_academy and date = v_today + 8 and start_min =  960;
  select id into s13 from sessions where academy_id = v_academy and date = v_today - 7 and start_min =  960;
  select id into s14 from sessions where academy_id = v_academy and date = v_today - 7 and start_min =  570;

  -- ---- enrollments (attendance states) ----
  insert into enrollments (academy_id, session_id, player_id, attendance) values
    (v_academy, s1,  p1, 'unmarked'),
    (v_academy, s2,  p3, 'unmarked'),
    (v_academy, s2,  p4, 'unmarked'),
    (v_academy, s2,  p6, 'unmarked'),
    (v_academy, s3,  p2, 'present'),
    -- s4 is past with nothing marked -> shows as "attendance missing"
    (v_academy, s4,  p1, 'unmarked'),
    (v_academy, s4,  p2, 'unmarked'),
    (v_academy, s4,  p4, 'unmarked'),
    (v_academy, s4,  p5, 'unmarked'),
    (v_academy, s5,  p3, 'unmarked'),
    (v_academy, s6,  p5, 'present'),
    (v_academy, s7,  p3, 'unmarked'),
    (v_academy, s7,  p6, 'unmarked'),
    (v_academy, s8,  p6, 'unmarked'),
    (v_academy, s9,  p1, 'unmarked'),
    (v_academy, s9,  p2, 'unmarked'),
    (v_academy, s9,  p5, 'unmarked'),
    (v_academy, s10, p4, 'unmarked'),
    (v_academy, s11, p1, 'unmarked'),
    (v_academy, s11, p2, 'unmarked'),
    (v_academy, s11, p3, 'unmarked'),
    (v_academy, s11, p4, 'unmarked'),
    (v_academy, s11, p5, 'unmarked'),
    (v_academy, s11, p6, 'unmarked'),
    (v_academy, s12, p1, 'unmarked'),
    (v_academy, s13, p1, 'skipped'),
    (v_academy, s14, p2, 'present'),
    (v_academy, s14, p3, 'absent'),
    (v_academy, s14, p6, 'present');

  -- ---- charges ----
  insert into charges (academy_id, player_id, session_id, amount_cents, due_date, is_manual, label, note) values
    (v_academy, p1, s1,  7500, v_today,     false, '', ''),
    (v_academy, p3, s2,  3500, v_today,     false, '', ''),
    (v_academy, p4, s2,  3500, v_today,     false, '', ''),
    (v_academy, p6, s2,  3500, v_today,     false, '', ''),
    (v_academy, p2, s3,  9000, v_today,     false, '', ''),
    (v_academy, p1, s4,  3500, v_today - 3, false, '', ''),
    (v_academy, p2, s4,  3500, v_today - 3, false, '', ''),   -- overdue
    (v_academy, p4, s4,  3500, v_today - 3, false, '', 'Left early — credited 30 min'),
    (v_academy, p5, s4,  3500, v_today - 3, false, '', ''),
    (v_academy, p3, s5,  6000, v_today - 2, false, '', ''),   -- overdue
    (v_academy, p5, s6,  9000, v_today - 4, false, '', ''),
    (v_academy, p3, s7,  3500, v_today + 2, false, '', ''),   -- voided below
    (v_academy, p6, s7,  3500, v_today + 2, false, '', ''),   -- voided below
    (v_academy, p1, s9,  3500, v_today + 3, false, '', ''),
    (v_academy, p2, s9,  3500, v_today + 3, false, '', ''),
    (v_academy, p5, s9,  3500, v_today + 3, false, '', ''),
    (v_academy, p4, s10, 7500, v_today + 4, false, '', ''),   -- partially paid below
    (v_academy, p1, s12, 7500, v_today + 8, false, '', ''),
    (v_academy, p1, s13, 7500, v_today - 7, false, '', ''),
    (v_academy, p2, s14, 3500, v_today - 7, false, '', ''),
    (v_academy, p3, s14, 3500, v_today - 7, false, '', 'Missed — family emergency'),
    (v_academy, p6, s14, 3500, v_today - 7, false, '', ''),
    (v_academy, p2, null, 2500, v_today + 4, true, 'Racquet restring', 'Wilson Blade — 52 lbs');

  -- ---- payments (money actually received) ----
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 3500, v_today - 1, '' from charges where academy_id = v_academy and session_id = s2  and player_id = p6;
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 9000, v_today,     '' from charges where academy_id = v_academy and session_id = s3  and player_id = p2;
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 3500, v_today - 3, '' from charges where academy_id = v_academy and session_id = s4  and player_id = p1;
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 3500, v_today - 2, '' from charges where academy_id = v_academy and session_id = s4  and player_id = p5;
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 9000, v_today - 4, '' from charges where academy_id = v_academy and session_id = s6  and player_id = p5;
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 3500, v_today - 2, '' from charges where academy_id = v_academy and session_id = s9  and player_id = p5;
  -- Partial: $30 of a $75 charge, leaving $45 outstanding.
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 3000, v_today - 1, 'Part payment — balance next week'
    from charges where academy_id = v_academy and session_id = s10 and player_id = p4;
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 7500, v_today - 7, '' from charges where academy_id = v_academy and session_id = s13 and player_id = p1;
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 3500, v_today - 7, '' from charges where academy_id = v_academy and session_id = s14 and player_id = p2;
  insert into payments (academy_id, charge_id, amount_cents, paid_on, note)
  select v_academy, id, 3500, v_today - 6, '' from charges where academy_id = v_academy and session_id = s14 and player_id = p6;

  -- ---- credits (write-downs, never revenue) ----
  insert into credits (academy_id, charge_id, amount_cents, reason)
  select v_academy, id, 1500, 'Left early — credited 30 min'
    from charges where academy_id = v_academy and session_id = s4 and player_id = p4;
  -- Fully credited -> renders as "Credited", owes nothing.
  insert into credits (academy_id, charge_id, amount_cents, reason)
  select v_academy, id, 3500, 'Missed — family emergency'
    from charges where academy_id = v_academy and session_id = s14 and player_id = p3;

  -- ---- voided charges (cancelled session) ----
  update charges
     set voided_at = now(), void_note = 'Written off — session cancelled'
   where academy_id = v_academy and session_id = s7;

  raise notice 'CoachOS seed complete for academy %', v_academy;
end $$;
