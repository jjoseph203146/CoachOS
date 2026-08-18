/**
 * Development seed data, ported from the design prototype's `seed()` block.
 *
 * Dates are anchored as offsets from "today" rather than hard-coded, so the
 * demo keeps exercising the same states (overdue, attendance missing, upcoming,
 * cancelled…) whenever it is run.
 *
 * Two profiles are provided:
 *   'established' — a working coach with history across every UI state
 *   'brand-new'   — a coach with no players, sessions or charges
 */

import { addDays, todayISO } from '@/lib/domain/dates'
import type {
  AttendanceStatus,
  Charge,
  Coach,
  Credit,
  Enrollment,
  Payment,
  Player,
  Session,
} from '@/lib/domain/types'

export interface SeedData {
  coach: Coach
  players: Player[]
  sessions: Session[]
  enrollments: Enrollment[]
  charges: Charge[]
  payments: Payment[]
  credits: Credit[]
}

export type SeedProfile = 'established' | 'brand-new'

const NOW = '2026-01-01T00:00:00.000Z'

export function buildSeed(
  profile: SeedProfile = 'established',
  coachId = 'coach_demo',
  today = todayISO(),
): SeedData {
  const coach: Coach = {
    id: coachId,
    name: 'Jacob Reyes',
    email: 'jacob@peakperformance.co',
    businessName: 'Peak Performance Tennis',
    defaultRateCents: 7000,
    attendanceWindow: '24 hours',
    theme: 'Light',
    onboardedAt: NOW,
  }

  if (profile === 'brand-new') {
    return {
      coach: { ...coach, name: 'Jacob', businessName: '', onboardedAt: null },
      players: [],
      sessions: [],
      enrollments: [],
      charges: [],
      payments: [],
      credits: [],
    }
  }

  const D = (offset: number) => addDays(today, offset)

  const player = (
    id: string,
    name: string,
    level: Player['level'],
    rateCents: number | null,
    phone: string,
    email: string,
    notes: string,
    archived = false,
  ): Player => ({
    id,
    coachId,
    name,
    level,
    defaultRateCents: rateCents,
    phone,
    email,
    notes,
    archived,
    deletedAt: null,
    createdAt: NOW,
  })

  const players: Player[] = [
    player(
      'p1',
      'Maya Okonkwo',
      'Intermediate',
      7500,
      '(415) 555-0114',
      'maya.o@example.com',
      'Working on two-handed backhand consistency. Serve toss drifting right — film it next session.',
    ),
    player(
      'p2',
      'Marcus Johnson',
      'Advanced',
      9000,
      '(415) 555-0182',
      'marcus.j@example.com',
      'Prepping for the Labor Day open. Focus: return depth and net transitions.',
    ),
    player(
      'p3',
      'Sophia Williams',
      'Beginner',
      6000,
      '(415) 555-0139',
      'sophia.w@example.com',
      'New to the game — keep drills short and fun. Eastern forehand grip.',
    ),
    player(
      'p4',
      'Daniel Brown',
      'Intermediate',
      7500,
      '(415) 555-0167',
      'daniel.b@example.com',
      'Footwork ladder warmups. Wears a knee brace — avoid extended lateral drills.',
    ),
    player(
      'p5',
      'Ethan Davis',
      'Advanced',
      9000,
      '(415) 555-0158',
      'ethan.d@example.com',
      'College recruiting tape in September. Building serve +1 patterns.',
    ),
    player(
      'p6',
      'Olivia Carter',
      'Beginner',
      6000,
      '(415) 555-0121',
      'olivia.c@example.com',
      'Second month. Building rally tolerance — 10-ball goal.',
    ),
    player(
      'p7',
      'Liam Foster',
      'Intermediate',
      7000,
      '(415) 555-0175',
      'liam.f@example.com',
      'Moved across town in June.',
      true,
    ),
  ]

  const session = (
    id: string,
    type: Session['type'],
    name: string,
    date: string,
    startMin: number,
    durationMin: number,
    priceCents: number,
    isFree: boolean,
    location: string,
    capacity: number | null,
    extra: Partial<Session> = {},
  ): Session => ({
    id,
    coachId,
    type,
    name,
    date,
    startMin,
    durationMin,
    priceCents,
    isFree,
    location,
    capacity,
    status: 'scheduled',
    attendanceSkipped: false,
    cancelledAt: null,
    createdAt: NOW,
    ...extra,
  })

  const sessions: Session[] = [
    session('s1', 'private', 'Maya Okonkwo Private Lesson', D(0), 960, 60, 7500, false, 'Court 2', null),
    session('s2', 'group', 'Sunday Evening Group', D(0), 1080, 90, 3500, false, 'Court 1', 6),
    session('s3', 'private', 'Marcus Johnson Private Lesson', D(0), 540, 60, 9000, false, 'Court 2', null),
    session('s4', 'group', 'Wednesday Drills', D(-3), 1020, 90, 3500, false, 'Main Court', 6),
    session('s5', 'private', 'Sophia Williams Private Lesson', D(-2), 600, 60, 6000, false, 'Court 3', null),
    session('s6', 'private', 'Ethan Davis Private Lesson', D(-4), 1080, 60, 9000, false, 'Court 2', null),
    session('s7', 'group', 'Tuesday Group', D(2), 1020, 90, 3500, false, 'Court 1', 6, {
      status: 'cancelled',
      cancelledAt: NOW,
    }),
    session('s8', 'private', 'Olivia Carter Private Lesson', D(1), 600, 45, 0, true, 'Court 1', null),
    session('s9', 'group', 'Wednesday Drills', D(3), 1020, 90, 3500, false, 'Main Court', 6),
    session('s10', 'private', 'Daniel Brown Private Lesson', D(4), 1020, 60, 7500, false, 'Court 3', null),
    session('s11', 'group', 'Saturday Group Session', D(6), 570, 120, 0, true, 'Main Court', 6),
    session('s12', 'private', 'Maya Okonkwo Private Lesson', D(8), 960, 60, 7500, false, 'Court 2', null),
    session('s13', 'private', 'Maya Okonkwo Private Lesson', D(-7), 960, 60, 7500, false, 'Court 2', null, {
      attendanceSkipped: true,
    }),
    session('s14', 'group', 'Saturday Group Session', D(-7), 570, 120, 3500, false, 'Main Court', 6),
  ]

  let enrollSeq = 0
  const enroll = (
    sessionId: string,
    playerId: string,
    attendance: AttendanceStatus = 'unmarked',
  ): Enrollment => ({
    id: `e${++enrollSeq}`,
    coachId,
    sessionId,
    playerId,
    attendance,
    createdAt: NOW,
  })

  const enrollments: Enrollment[] = [
    enroll('s1', 'p1'),
    enroll('s2', 'p3'),
    enroll('s2', 'p4'),
    enroll('s2', 'p6'),
    enroll('s3', 'p2', 'present'),
    // s4 is in the past with nothing marked -> "attendance missing"
    enroll('s4', 'p1'),
    enroll('s4', 'p2'),
    enroll('s4', 'p4'),
    enroll('s4', 'p5'),
    enroll('s5', 'p3'),
    enroll('s6', 'p5', 'present'),
    enroll('s7', 'p3'),
    enroll('s7', 'p6'),
    enroll('s8', 'p6'),
    enroll('s9', 'p1'),
    enroll('s9', 'p2'),
    enroll('s9', 'p5'),
    enroll('s10', 'p4'),
    enroll('s11', 'p1'),
    enroll('s11', 'p2'),
    enroll('s11', 'p3'),
    enroll('s11', 'p4'),
    enroll('s11', 'p5'),
    enroll('s11', 'p6'),
    enroll('s12', 'p1'),
    // s13 had attendance deliberately skipped
    enroll('s13', 'p1', 'skipped'),
    enroll('s14', 'p2', 'present'),
    enroll('s14', 'p3', 'absent'),
    enroll('s14', 'p6', 'present'),
  ]

  const charge = (
    id: string,
    playerId: string,
    sessionId: string | null,
    amountCents: number,
    dueDate: string,
    extra: Partial<Charge> = {},
  ): Charge => ({
    id,
    coachId,
    playerId,
    sessionId,
    amountCents,
    dueDate,
    isManual: false,
    label: '',
    note: '',
    voidedAt: null,
    voidNote: '',
    createdAt: NOW,
    ...extra,
  })

  const voidNote = 'Written off — session cancelled'

  const charges: Charge[] = [
    charge('c1', 'p1', 's1', 7500, D(0)),
    charge('c2', 'p3', 's2', 3500, D(0)),
    charge('c3', 'p4', 's2', 3500, D(0)),
    charge('c4', 'p6', 's2', 3500, D(0)),
    charge('c5', 'p2', 's3', 9000, D(0)),
    charge('c6', 'p1', 's4', 3500, D(-3)),
    charge('c7', 'p2', 's4', 3500, D(-3)), // overdue
    charge('c8', 'p4', 's4', 3500, D(-3), { note: 'Left early — credited 30 min' }),
    charge('c9', 'p5', 's4', 3500, D(-3)),
    charge('c10', 'p3', 's5', 6000, D(-2)), // overdue
    charge('c11', 'p5', 's6', 9000, D(-4)),
    charge('c12', 'p3', 's7', 3500, D(2), { voidedAt: NOW, voidNote }),
    charge('c13', 'p6', 's7', 3500, D(2), { voidedAt: NOW, voidNote }),
    charge('c14', 'p1', 's9', 3500, D(3)),
    charge('c15', 'p2', 's9', 3500, D(3)),
    charge('c16', 'p5', 's9', 3500, D(3)),
    charge('c17', 'p4', 's10', 7500, D(4)), // carries a partial payment below
    charge('c18', 'p1', 's12', 7500, D(8)),
    charge('c19', 'p1', 's13', 7500, D(-7)),
    charge('c20', 'p2', 's14', 3500, D(-7)),
    charge('c21', 'p3', 's14', 3500, D(-7), { note: 'Missed — family emergency' }),
    charge('c22', 'p6', 's14', 3500, D(-7)),
    charge('c23', 'p2', null, 2500, D(4), {
      isManual: true,
      label: 'Racquet restring',
      note: 'Wilson Blade — 52 lbs',
    }),
  ]

  let paySeq = 0
  const payment = (
    chargeId: string,
    amountCents: number,
    paidOn: string,
    note = '',
  ): Payment => ({
    id: `pay${++paySeq}`,
    coachId,
    chargeId,
    amountCents,
    paidOn,
    note,
    createdAt: NOW,
  })

  const payments: Payment[] = [
    payment('c4', 3500, D(-1)),
    payment('c5', 9000, D(0)),
    payment('c6', 3500, D(-3)),
    payment('c9', 3500, D(-2)),
    payment('c11', 9000, D(-4)),
    payment('c16', 3500, D(-2)),
    // Partial payment: $30 of a $75 charge, leaving $45 outstanding.
    payment('c17', 3000, D(-1), 'Part payment — balance next week'),
    payment('c19', 7500, D(-7)),
    payment('c20', 3500, D(-7)),
    payment('c22', 3500, D(-6)),
  ]

  let creditSeq = 0
  const credit = (chargeId: string, amountCents: number, reason: string): Credit => ({
    id: `cr${++creditSeq}`,
    coachId,
    chargeId,
    amountCents,
    reason,
    createdAt: NOW,
  })

  const credits: Credit[] = [
    credit('c8', 1500, 'Left early — credited 30 min'),
    // Fully credited charge -> renders as "Credited", owes nothing.
    credit('c21', 3500, 'Missed — family emergency'),
  ]

  return { coach, players, sessions, enrollments, charges, payments, credits }
}
