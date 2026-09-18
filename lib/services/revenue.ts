/**
 * Revenue read model and "Record Revenue".
 *
 * Revenue is money received: the sum of PAYMENTS. Recording revenue therefore
 * creates a manual charge and pays it in full on the chosen date, through the
 * same guarded payment path as everything else — there is no second kind of
 * revenue record.
 */

import type { DataStore } from '@/lib/data/store'
import { addDays } from '@/lib/domain/dates'
import { revenueBetween } from '@/lib/domain/finance'
import {
  CATEGORY_LABEL,
  RECORD_CATEGORIES,
  categoryOf,
  percentChange,
  weekStart,
  type RevenueCategory,
} from '@/lib/domain/revenue'
import type { ISODate, MembershipRole } from '@/lib/domain/types'
import { DomainError } from './errors'
import { createManualCharge, recordPayment } from './finance'

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export interface RevenueSummary {
  todayCents: number
  weekCents: number
  monthCents: number
  /** Monday to Sunday of the current week. */
  weekDays: Array<{ date: ISODate; label: string; cents: number; isToday: boolean }>
  /** This week vs last week; null when last week had no revenue. */
  weekChangePercent: number | null
  /** This month, largest first, empty categories omitted. */
  categories: Array<{ key: RevenueCategory; label: string; cents: number; sharePercent: number }>
  recent: Array<{
    id: string
    playerName: string
    cents: number
    paidOn: ISODate
    label: string
  }>
}

export async function loadRevenue(
  store: DataStore,
  coachId: string,
  today: ISODate,
): Promise<RevenueSummary> {
  const [payments, charges, sessions, programs, players] = await Promise.all([
    store.listPayments(coachId),
    store.listCharges(coachId),
    store.listSessions(coachId),
    store.listPrograms(coachId),
    store.listPlayers(coachId, { includeDeleted: true }),
  ])
  const chargeById = new Map(charges.map((c) => [c.id, c]))
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const programById = new Map(programs.map((p) => [p.id, p]))
  const playerName = new Map(players.map((p) => [p.id, p.name]))

  const start = weekStart(today)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const weekCents = revenueBetween(payments, start, addDays(start, 6))
  const lastWeekCents = revenueBetween(payments, addDays(start, -7), addDays(start, -1))
  const monthPrefix = today.slice(0, 7)

  const byCategory = new Map<RevenueCategory, number>()
  let monthCents = 0
  for (const payment of payments) {
    if (payment.paidOn.slice(0, 7) !== monthPrefix || payment.paidOn > today) continue
    const charge = chargeById.get(payment.chargeId)
    const session = charge?.sessionId ? sessionById.get(charge.sessionId) : undefined
    const program = charge?.programId ? programById.get(charge.programId) : undefined
    const key = categoryOf(charge, session, program)
    byCategory.set(key, (byCategory.get(key) ?? 0) + payment.amountCents)
    monthCents += payment.amountCents
  }

  return {
    todayCents: revenueBetween(payments, today, today),
    weekCents,
    monthCents,
    weekDays: days.map((date, i) => ({
      date,
      label: WEEKDAY[i],
      cents: revenueBetween(payments, date, date),
      isToday: date === today,
    })),
    weekChangePercent: percentChange(weekCents, lastWeekCents),
    categories: [...byCategory.entries()]
      .filter(([, cents]) => cents > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key, cents]) => ({
        key,
        label: CATEGORY_LABEL[key],
        cents,
        sharePercent: monthCents > 0 ? Math.round((cents / monthCents) * 100) : 0,
      })),
    recent: [...payments]
      .sort((a, b) =>
        a.paidOn === b.paidOn ? (a.createdAt < b.createdAt ? 1 : -1) : a.paidOn < b.paidOn ? 1 : -1,
      )
      .slice(0, 5)
      .map((payment) => {
        const charge = chargeById.get(payment.chargeId)
        const session = charge?.sessionId ? sessionById.get(charge.sessionId) : undefined
        return {
          id: payment.id,
          playerName: playerName.get(charge?.playerId ?? '') ?? 'Player',
          cents: payment.amountCents,
          paidOn: payment.paidOn,
          label:
            charge?.label ||
            (session ? (session.type === 'private' ? 'Private Lesson' : session.name) : 'Payment'),
        }
      }),
  }
}

export interface RecordRevenueArgs {
  playerId: string
  amountCents: number
  category: RevenueCategory
  paidOn: ISODate
  note: string
}

/** Owner only: money received that no existing charge covers. */
export async function recordRevenue(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  args: RecordRevenueArgs,
  today: ISODate,
): Promise<void> {
  if (role !== 'owner') {
    throw new DomainError('FORBIDDEN', 'Only the academy owner can record revenue.')
  }
  if (args.amountCents <= 0) throw new DomainError('INVALID', 'Enter an amount greater than zero.')
  if (args.paidOn > today) {
    throw new DomainError('INVALID', 'Revenue is money already received, so the date can’t be in the future.')
  }
  const category = RECORD_CATEGORIES.find((c) => c.key === args.category)
  if (!category) throw new DomainError('INVALID', 'Choose a category.')

  await store.transaction(async (tx) => {
    const charge = await createManualCharge(tx, coachId, {
      playerId: args.playerId,
      amountCents: args.amountCents,
      dueDate: args.paidOn,
      label: category.label,
      note: args.note,
    })
    await recordPayment(tx, coachId, {
      chargeId: charge.id,
      amountCents: args.amountCents,
      today,
      paidOn: args.paidOn,
      note: args.note,
    })
  })
}
