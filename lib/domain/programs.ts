/**
 * Program rules: which dates a program meets on, how a weekly/monthly price
 * maps onto a billing period, and the labels the screens share. Pure — no I/O.
 */

import { addDays } from './dates'
import type { ISODate, PriceBasis, Program } from './types'

export const BASIS_LABEL: Record<PriceBasis, string> = {
  per_session: 'Per session',
  drop_in: 'Drop-in',
  weekly: 'Weekly',
  monthly: 'Monthly',
  full_program: 'Full program',
  custom: 'Custom',
}

/** Bases a coach can pick when defining a price option. */
export const BASIS_CHOICES: PriceBasis[] = [
  'weekly',
  'monthly',
  'per_session',
  'drop_in',
  'full_program',
]

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const weekdayShort = (day: number) => WEEKDAY_SHORT[day] ?? ''

/** "Mon–Thu", "Tue", "Mon, Wed, Fri" — consecutive runs collapse to a range. */
export function weekdaysLabel(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  const runs: number[][] = []
  for (const day of sorted) {
    const last = runs[runs.length - 1]
    if (last && day === last[last.length - 1] + 1) last.push(day)
    else runs.push([day])
  }
  return runs
    .map((run) =>
      run.length >= 3
        ? `${weekdayShort(run[0])}–${weekdayShort(run[run.length - 1])}`
        : run.map(weekdayShort).join(', '),
    )
    .join(', ')
}

function dayOfWeek(iso: ISODate): number {
  return new Date(iso + 'T12:00:00').getDay()
}

/**
 * Every date in [from, to] on which the program meets, clipped to the
 * program's own start and end dates.
 */
export function occurrenceDates(
  program: Pick<Program, 'weekdays' | 'startsOn' | 'endsOn'>,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  const start = from > program.startsOn ? from : program.startsOn
  const end = program.endsOn && program.endsOn < to ? program.endsOn : to
  const days = new Set(program.weekdays)
  const dates: ISODate[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (days.has(dayOfWeek(date))) dates.push(date)
  }
  return dates
}

function addMonthsClamped(iso: ISODate, months: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate()
  const day = Math.min(d, lastDay)
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${target.getUTCFullYear()}-${p(target.getUTCMonth() + 1)}-${p(day)}`
}

/**
 * The period a weekly or monthly charge covers, starting on `start`. Other
 * bases (drop-in, full program, per session) cover no period.
 */
export function billingPeriod(
  basis: PriceBasis,
  start: ISODate,
): { start: ISODate; end: ISODate } | null {
  if (basis === 'weekly') return { start, end: addDays(start, 6) }
  if (basis === 'monthly') return { start, end: addDays(addMonthsClamped(start, 1), -1) }
  return null
}

/** Bases whose charges recur, one per period. */
export const isRecurringBasis = (basis: PriceBasis) => basis === 'weekly' || basis === 'monthly'
