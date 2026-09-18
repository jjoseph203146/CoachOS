/**
 * Private-lesson availability.
 *
 * A coach sets, for each weekday, the hours they offer private lessons; a day
 * with no window is unavailable. This GUIDES booking — a lesson outside it can
 * still be booked on purpose — and it stops availability being narrowed
 * underneath a lesson that is already booked. Pure; no I/O.
 */

import { formatTime } from './dates'
import type { ISODate, Session } from './types'

export interface HoursWindow {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  startMin: number
  endMin: number
}

export type AvailabilityCheck =
  | { ok: true }
  | { ok: false; reason: 'none' | 'outside'; window: HoursWindow | null }

const weekdayOf = (date: ISODate) => new Date(date + 'T12:00:00').getDay()

export function windowForDate(windows: HoursWindow[], date: ISODate): HoursWindow | null {
  const day = weekdayOf(date)
  return windows.find((w) => w.weekday === day) ?? null
}

/**
 * Is a lesson at this time inside the coach's availability? A coach who has
 * set no availability at all is not restricted.
 */
export function checkAvailability(
  windows: HoursWindow[],
  date: ISODate,
  startMin: number,
  durationMin: number,
): AvailabilityCheck {
  if (windows.length === 0) return { ok: true }
  const window = windowForDate(windows, date)
  if (!window) return { ok: false, reason: 'none', window: null }
  if (startMin < window.startMin || startMin + durationMin > window.endMin) {
    return { ok: false, reason: 'outside', window }
  }
  return { ok: true }
}

/**
 * Booked private lessons a proposed set of hours would leave stranded. These
 * block saving: update or cancel the lesson first.
 */
export function strandedLessons(
  proposed: HoursWindow[],
  sessions: Session[],
  membershipId: string,
  today: ISODate,
): Session[] {
  return sessions
    .filter(
      (s) =>
        s.type === 'private' &&
        s.status === 'scheduled' &&
        s.date >= today &&
        s.coachMembershipId === membershipId,
    )
    .filter((s) => !checkAvailability(proposed, s.date, s.startMin, s.durationMin).ok)
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))
}

export function windowLabel(window: HoursWindow | null): string {
  return window ? `${formatTime(window.startMin)} – ${formatTime(window.endMin)}` : 'Unavailable'
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
