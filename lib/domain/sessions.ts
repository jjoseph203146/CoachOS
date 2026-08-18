/**
 * Session and attendance derivation, ported from the prototype's logic.
 */

import type {
  AttendanceStatus,
  Enrollment,
  ISODate,
  Session,
  SessionAttendanceState,
} from './types'

/** Clock reference used for "has this session ended?" decisions. */
export interface Clock {
  today: ISODate
  nowMinutes: number
}

export function sessionEndMin(session: Session): number {
  return session.startMin + session.durationMin
}

/** True once the session's end time has passed. */
export function isPast(session: Session, clock: Clock): boolean {
  if (session.date < clock.today) return true
  return session.date === clock.today && sessionEndMin(session) < clock.nowMinutes
}

/**
 * Roll up per-player attendance into a session-level state.
 *
 * `skipped` is distinct from `unmarked`: the coach deliberately opted out,
 * so the session is excluded from attendance metrics and never nags.
 */
export function attendanceState(
  session: Session,
  enrollments: Enrollment[],
): SessionAttendanceState {
  if (session.attendanceSkipped) return 'skipped'
  if (session.status === 'cancelled') return 'na'
  if (enrollments.length === 0) return 'na'
  const marked = enrollments.filter(
    (e) => e.attendance === 'present' || e.attendance === 'absent',
  ).length
  if (marked === 0) return 'unmarked'
  if (marked === enrollments.length) return 'complete'
  return 'partial'
}

/**
 * Does this session still owe the coach an attendance decision?
 * Cancelled and skipped sessions never do.
 */
export function attendanceMissing(
  session: Session,
  enrollments: Enrollment[],
  clock: Clock,
): boolean {
  if (session.status === 'cancelled') return false
  if (session.attendanceSkipped) return false
  if (enrollments.length === 0) return false
  if (!isPast(session, clock)) return false
  return attendanceState(session, enrollments) !== 'complete'
}

/** Count of players marked present / absent, for attendance-rate maths. */
export function attendanceTally(enrollments: Enrollment[]): {
  present: number
  absent: number
} {
  let present = 0
  let absent = 0
  for (const e of enrollments) {
    if (e.attendance === 'present') present++
    if (e.attendance === 'absent') absent++
  }
  return { present, absent }
}

/** Attendance rate as a whole-number percentage, or null when there is no data. */
export function attendanceRate(enrollments: Enrollment[]): number | null {
  const { present, absent } = attendanceTally(enrollments)
  const total = present + absent
  if (total === 0) return null
  return Math.round((present / total) * 100)
}

/**
 * Find a scheduled session that overlaps the given window on the same day.
 * Cancelled sessions never conflict. `excludeSessionId` lets a session avoid
 * conflicting with itself while being edited.
 */
export function findConflict(
  sessions: Session[],
  date: ISODate,
  startMin: number,
  endMin: number,
  excludeSessionId?: string | null,
): Session | null {
  const hit = sessions.find(
    (s) =>
      s.id !== excludeSessionId &&
      s.status !== 'cancelled' &&
      s.date === date &&
      !(endMin <= s.startMin || startMin >= sessionEndMin(s)),
  )
  return hit ?? null
}

/** Chronological ordering used by the schedule and dashboard. */
export function compareSessions(a: Session, b: Session): number {
  if (a.date === b.date) return a.startMin - b.startMin
  return a.date < b.date ? -1 : 1
}

/**
 * Coaching cadence label shown on player rows, ported from `actLabel()`:
 * counts non-cancelled sessions in the trailing 30 days.
 */
export function activityLabel(
  sessions: Session[],
  enrollments: Enrollment[],
  playerId: string,
  today: ISODate,
): string {
  const windowStart = addDaysISO(today, -30)
  const sessionIds = new Set(
    enrollments.filter((e) => e.playerId === playerId).map((e) => e.sessionId),
  )
  const count = sessions.filter(
    (s) =>
      s.status !== 'cancelled' &&
      sessionIds.has(s.id) &&
      s.date >= windowStart &&
      s.date <= today,
  ).length
  if (count >= 4) return '2× weekly'
  if (count >= 2) return 'Weekly'
  if (count >= 1) return 'Occasional'
  return 'New'
}

// Local copy to avoid a circular import with dates.ts.
function addDaysISO(iso: ISODate, days: number): ISODate {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Resolve the per-player price for a new session, mirroring `nsAuto()`:
 * a private lesson defaults to the player's own rate, falling back to the
 * coach default. Group sessions have no automatic price.
 */
export function defaultPriceCents(
  type: 'private' | 'group',
  playerRateCents: number | null | undefined,
  coachDefaultRateCents: number,
): number | null {
  if (type !== 'private') return null
  return playerRateCents ?? coachDefaultRateCents
}

/** Auto-generated session name, mirroring `nsAuto()`. */
export function defaultSessionName(
  type: 'private' | 'group',
  date: ISODate,
  firstPlayerName?: string | null,
): string {
  if (type === 'private') {
    return firstPlayerName ? `${firstPlayerName} Private Lesson` : 'Private Lesson'
  }
  const dowFull = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][new Date(date + 'T12:00:00').getDay()]
  return `${dowFull} Group Session`
}

/** Per-player attendance label + colour, matching the prototype exactly. */
export function attendanceLabel(
  status: AttendanceStatus,
  sessionSkipped: boolean,
): { text: string; color: string } {
  if (sessionSkipped || status === 'skipped') return { text: 'Skipped', color: '#8A8E89' }
  if (status === 'present') return { text: 'Present', color: '#2E7D4F' }
  if (status === 'absent') return { text: 'Absent', color: '#B3402F' }
  return { text: 'Unmarked', color: '#8A8E89' }
}
