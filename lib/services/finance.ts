/**
 * Financial service.
 *
 * Every screen that shows money goes through `loadFinance()`. There is exactly
 * one derivation path, so the Dashboard, Players, Player Detail, Payments and
 * Session Detail screens cannot disagree about a balance.
 */

import type { DataStore } from '@/lib/data/store'
import { todayISO } from '@/lib/domain/dates'
import {
  creditFits,
  outstandingTotal,
  paymentFits,
  playerOutstanding,
  revenueBetween,
  sessionOutstanding,
  viewCharges,
} from '@/lib/domain/finance'
import type { ChargeView, ISODate, Payment } from '@/lib/domain/types'
import { DomainError } from './errors'

export interface FinanceSnapshot {
  today: ISODate
  views: ChargeView[]
  payments: Payment[]
  byChargeId: Map<string, ChargeView>
  outstandingFor(playerId: string): number
  outstandingForSession(sessionId: string): number
  forSession(sessionId: string): ChargeView[]
  forPlayer(playerId: string): ChargeView[]
  pending(): ChargeView[]
  overdue(): ChargeView[]
  totalOutstanding(): number
  revenue(from: ISODate, to: ISODate): number
}

/** Load and derive the coach's entire financial picture in one pass. */
export async function loadFinance(
  store: DataStore,
  coachId: string,
  today: ISODate = todayISO(),
): Promise<FinanceSnapshot> {
  const [charges, payments, credits] = await Promise.all([
    store.listCharges(coachId),
    store.listPayments(coachId),
    store.listCredits(coachId),
  ])

  const paymentsByCharge = new Map<string, Payment[]>()
  for (const payment of payments) {
    const list = paymentsByCharge.get(payment.chargeId) ?? []
    list.push(payment)
    paymentsByCharge.set(payment.chargeId, list)
  }

  const creditsByCharge = new Map<string, typeof credits>()
  for (const credit of credits) {
    const list = creditsByCharge.get(credit.chargeId) ?? []
    list.push(credit)
    creditsByCharge.set(credit.chargeId, list)
  }

  const views = viewCharges(
    charges.map((charge) => ({
      charge,
      payments: paymentsByCharge.get(charge.id) ?? [],
      credits: creditsByCharge.get(charge.id) ?? [],
    })),
    today,
  )

  const byChargeId = new Map(views.map((v) => [v.charge.id, v]))

  return {
    today,
    views,
    payments,
    byChargeId,
    outstandingFor: (playerId) => playerOutstanding(views, playerId),
    outstandingForSession: (sessionId) => sessionOutstanding(views, sessionId),
    forSession: (sessionId) => views.filter((v) => v.charge.sessionId === sessionId),
    forPlayer: (playerId) => views.filter((v) => v.charge.playerId === playerId),
    pending: () => views.filter((v) => v.isPending),
    overdue: () => views.filter((v) => v.isOverdue),
    totalOutstanding: () => outstandingTotal(views.filter((v) => v.isPending)),
    revenue: (from, to) => revenueBetween(payments, from, to),
  }
}

/** Derived view of a single charge, or a domain error if it isn't the coach's. */
export async function getChargeView(
  store: DataStore,
  coachId: string,
  chargeId: string,
  today: ISODate = todayISO(),
): Promise<ChargeView> {
  const charge = await store.getCharge(coachId, chargeId)
  if (!charge) throw new DomainError('NOT_FOUND', 'That charge could not be found.')
  const [payments, credits] = await Promise.all([
    store.listPaymentsForCharge(coachId, chargeId),
    store.listCreditsForCharge(coachId, chargeId),
  ])
  return viewCharges([{ charge, payments, credits }], today)[0]
}

/**
 * Record a payment against a charge.
 *
 * `expectedOutstandingCents` is an optimistic-concurrency guard: the client
 * sends the amount it believed was outstanding, and we refuse the write if the
 * charge moved underneath it. This is what stops a double-tapped "Mark Paid"
 * from recording the same money twice.
 */
export async function recordPayment(
  store: DataStore,
  coachId: string,
  args: {
    chargeId: string
    amountCents: number
    paidOn?: ISODate
    note?: string
    expectedOutstandingCents?: number
  },
): Promise<void> {
  const today = todayISO()
  await store.transaction(async (tx) => {
    const view = await getChargeView(tx, coachId, args.chargeId, today)

    if (view.charge.voidedAt) {
      throw new DomainError('INVALID', 'This charge was written off and cannot be paid.')
    }
    if (view.outstandingCents === 0) {
      throw new DomainError('CONFLICT', 'This charge is already settled.')
    }
    if (
      args.expectedOutstandingCents !== undefined &&
      args.expectedOutstandingCents !== view.outstandingCents
    ) {
      throw new DomainError(
        'CONFLICT',
        'This charge changed while you were looking at it. Reopen it and try again.',
      )
    }
    if (!paymentFits(view, args.amountCents)) {
      throw new DomainError(
        'INVALID',
        'A payment must be more than zero and cannot exceed the remaining balance.',
      )
    }

    await tx.recordPayment(coachId, {
      chargeId: args.chargeId,
      amountCents: args.amountCents,
      paidOn: args.paidOn ?? today,
      note: args.note ?? '',
    })
  })
}

/** Apply a credit (a write-down that is not money received). */
export async function recordCredit(
  store: DataStore,
  coachId: string,
  args: { chargeId: string; amountCents: number; reason?: string },
): Promise<void> {
  const today = todayISO()
  await store.transaction(async (tx) => {
    const view = await getChargeView(tx, coachId, args.chargeId, today)

    if (view.charge.voidedAt) {
      throw new DomainError('INVALID', 'This charge was written off already.')
    }
    if (!creditFits(view, args.amountCents)) {
      throw new DomainError(
        'INVALID',
        'A credit must be more than zero and cannot exceed the remaining balance.',
      )
    }

    await tx.recordCredit(coachId, {
      chargeId: args.chargeId,
      amountCents: args.amountCents,
      reason: args.reason ?? '',
    })
  })
}

/**
 * "Mark Unpaid" — remove recorded payments so the charge returns to pending.
 * Credits are deliberately left intact: they represent a separate decision.
 */
export async function markUnpaid(
  store: DataStore,
  coachId: string,
  chargeId: string,
): Promise<void> {
  await store.transaction(async (tx) => {
    const charge = await tx.getCharge(coachId, chargeId)
    if (!charge) throw new DomainError('NOT_FOUND', 'That charge could not be found.')
    await tx.clearPayments(coachId, chargeId)
  })
}

/** Create an ad-hoc charge not tied to any session. */
export async function createManualCharge(
  store: DataStore,
  coachId: string,
  args: { playerId: string; amountCents: number; dueDate: ISODate; label: string },
): Promise<void> {
  const player = await store.getPlayer(coachId, args.playerId)
  if (!player || player.deletedAt) {
    throw new DomainError('NOT_FOUND', 'That player could not be found.')
  }
  if (args.amountCents <= 0) {
    throw new DomainError('INVALID', 'Enter an amount greater than zero.')
  }
  await store.createCharge(coachId, {
    playerId: args.playerId,
    sessionId: null,
    amountCents: args.amountCents,
    dueDate: args.dueDate,
    isManual: true,
    label: args.label || 'Manual charge',
    note: '',
  })
}
