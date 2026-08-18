import { DEFAULT_TIME_ZONE, zonedNow } from '@/lib/domain/dates'
import { attendanceGraceMinutes, type Clock } from '@/lib/domain/sessions'
import type { Coach } from '@/lib/domain/types'

/**
 * Build the clock for a coach.
 *
 * The server process runs in UTC on Vercel, so "today" MUST come from the
 * coach's own timezone. Reading the server's local date here would roll the
 * dashboard over to tomorrow in the middle of a Californian coach's evening
 * sessions.
 */
export function coachClock(
  coach: Pick<Coach, 'timezone'>,
  now: Date = new Date(),
): Clock {
  const { today, minutes } = zonedNow(coach.timezone || DEFAULT_TIME_ZONE, now)
  return { today, nowMinutes: minutes }
}

/** How long after a session ends before it counts as missing attendance. */
export function coachGraceMinutes(coach: Pick<Coach, 'attendanceWindow'>): number {
  return attendanceGraceMinutes(coach.attendanceWindow)
}
