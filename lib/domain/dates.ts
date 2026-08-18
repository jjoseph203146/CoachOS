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
