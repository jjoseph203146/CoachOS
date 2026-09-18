/**
 * Revenue reporting rules. Revenue is money RECEIVED — the sum of payments,
 * never of charges — so everything here is derived from payments and only
 * uses charges to say what each payment was for. Pure; no I/O.
 */

import { addDays } from './dates'
import type { Charge, ISODate, Program, Session } from './types'

export type RevenueCategory = 'private' | 'group' | 'youth' | 'adult' | 'other'

export const CATEGORY_LABEL: Record<RevenueCategory, string> = {
  private: 'Private Lessons',
  group: 'Group Sessions',
  youth: 'Youth Programs',
  adult: 'Adult Programs',
  other: 'Other',
}

/** What "Record Revenue" offers, and the label its charge carries. */
export const RECORD_CATEGORIES: Array<{ key: RevenueCategory; label: string }> = [
  { key: 'private', label: 'Private Lesson' },
  { key: 'group', label: 'Group Session' },
  { key: 'youth', label: 'Youth Program' },
  { key: 'adult', label: 'Adult Program' },
  { key: 'other', label: 'Other' },
]

const RECORD_LABEL_TO_KEY = new Map(RECORD_CATEGORIES.map((c) => [c.label, c.key]))

/** Monday of the week containing `date` — a working week reads Monday to Sunday. */
export function weekStart(date: ISODate): ISODate {
  const dow = new Date(date + 'T12:00:00').getDay() // 0 = Sunday
  return addDays(date, -((dow + 6) % 7))
}

/** Which category a payment belongs to, from the charge it settled. */
export function categoryOf(
  charge: Charge | undefined,
  session: Session | undefined,
  program: Program | undefined,
): RevenueCategory {
  if (!charge) return 'other'
  if (program) return program.audience === 'adult' ? 'adult' : 'youth'
  if (charge.isManual) return RECORD_LABEL_TO_KEY.get(charge.label) ?? 'other'
  if (session) return session.type === 'private' ? 'private' : 'group'
  return 'other'
}

/** % change from `previous` to `current`, or null when there is nothing to compare to. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
