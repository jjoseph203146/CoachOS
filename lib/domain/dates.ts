/**
 * Calendar helpers. Ported directly from the prototype's date utilities so
 * that every label ("Today", "Tue, Aug 18", "4:00 PM") renders identically.
 *
 * All dates are ISO 'YYYY-MM-DD' calendar strings and are parsed at local
 * noon to keep them immune to DST and timezone rollover.
 */

import type { ISODate } from './types'

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const MON_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const MON_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

export function parseISO(iso: ISODate): Date {
  return new Date(iso + 'T12:00:00')
}

export function toISO(date: Date): ISODate {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now)
}

/** Minutes from midnight for "now", used to decide whether a session ended. */
export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes()
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function dowShort(iso: ISODate): string {
  return DOW_SHORT[parseISO(iso).getDay()]
}

export function dowFull(iso: ISODate): string {
  return DOW_FULL[parseISO(iso).getDay()]
}

export function monthShort(iso: ISODate): string {
  return MON_SHORT[parseISO(iso).getMonth()]
}

export function monthFull(iso: ISODate): string {
  return MON_FULL[parseISO(iso).getMonth()]
}

export function dayOfMonth(iso: ISODate): number {
  return parseISO(iso).getDate()
}

/** "Sunday, August 16" */
export function formatLong(iso: ISODate): string {
  return `${dowFull(iso)}, ${monthFull(iso)} ${dayOfMonth(iso)}`
}

/** "Sun, Aug 16" */
export function formatMedium(iso: ISODate): string {
  return `${dowShort(iso)}, ${monthShort(iso)} ${dayOfMonth(iso)}`
}

/** "Aug 16" */
export function formatShort(iso: ISODate): string {
  return `${monthShort(iso)} ${dayOfMonth(iso)}`
}

/** "4:00 PM" from minutes-from-midnight. */
export function formatTime(minutes: number): string {
  let h = Math.floor(minutes / 60)
  const m = minutes % 60
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${pad2(m)} ${ap}`
}

/** "Today" / "Tomorrow" / "Yesterday", else "Sun, Aug 16". */
export function formatRelative(iso: ISODate, today: ISODate): string {
  if (iso === today) return 'Today'
  if (iso === addDays(today, 1)) return 'Tomorrow'
  if (iso === addDays(today, -1)) return 'Yesterday'
  return formatMedium(iso)
}

/** Number of days in the month of an ISO 'YYYY-MM' string. */
export function daysInMonth(ym: string): number {
  const year = parseInt(ym.slice(0, 4), 10)
  const month = parseInt(ym.slice(5, 7), 10)
  return new Date(year, month, 0).getDate()
}

/** Weekday index (0=Sun) that the 1st of the given 'YYYY-MM' falls on. */
export function firstDayOfMonthDow(ym: string): number {
  return parseISO(`${ym}-01`).getDay()
}

export function shiftMonth(ym: string, delta: number): string {
  let year = parseInt(ym.slice(0, 4), 10)
  let month = parseInt(ym.slice(5, 7), 10) + delta
  if (month < 1) {
    month = 12
    year--
  }
  if (month > 12) {
    month = 1
    year++
  }
  return `${year}-${pad2(month)}`
}

/** Initials for avatar circles, e.g. "Maya Okonkwo" -> "MO". */
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function firstName(name: string): string {
  return (name.trim() || 'Coach').split(' ')[0]
}

/** Greeting used on the dashboard header. */
export function greetingFor(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// ---------------------------------------------------------------------------
// Timezone-aware clock
//
// The server runs in UTC (Vercel does), so `new Date()` local parts are NOT the
// coach's calendar. Every "today", "has this ended?" and overdue decision must
// be made in the coach's own zone, or an evening session rolls into tomorrow
// for anyone west of Greenwich.
// ---------------------------------------------------------------------------

/** Fallback used when a coach has no timezone recorded yet. */
export const DEFAULT_TIME_ZONE = 'UTC'

/**
 * Current calendar date and minutes-past-midnight in the given IANA zone.
 * `en-CA` formats dates as YYYY-MM-DD, which is exactly our ISODate shape.
 */
export function zonedNow(
  timeZone: string,
  now: Date = new Date(),
): { today: ISODate; minutes: number } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
  } catch {
    // An invalid/unknown zone must never take the app down.
    return zonedNow(DEFAULT_TIME_ZONE, now)
  }

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'

  // Some ICU builds render midnight as hour "24".
  const hour = parseInt(get('hour'), 10) % 24
  const minute = parseInt(get('minute'), 10)

  return {
    today: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + minute,
  }
}

/** True when the string is an IANA zone this runtime understands. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Every IANA zone this runtime knows, for the settings picker.
 * `Intl.supportedValuesOf` is Node 18+/modern browsers; fall back to a short
 * list of common zones if it is unavailable.
 */
export function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[]
  }
  if (typeof intl.supportedValuesOf === 'function') {
    try {
      return intl.supportedValuesOf('timeZone')
    } catch {
      // fall through
    }
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Australia/Sydney',
  ]
}

/**
 * Whole minutes between two calendar moments, each expressed as an ISO date
 * plus minutes-past-midnight. Used for attendance grace periods.
 */
export function minutesBetween(
  fromDate: ISODate,
  fromMinutes: number,
  toDate: ISODate,
  toMinutes: number,
): number {
  const dayDelta = Math.round(
    (parseISO(toDate).getTime() - parseISO(fromDate).getTime()) / 86400000,
  )
  return dayDelta * 1440 + (toMinutes - fromMinutes)
}
