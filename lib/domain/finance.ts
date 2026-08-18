/**
 * Financial derivation — the single source of truth for every money figure
 * shown anywhere in CoachOS.
 *
 * There is deliberately NO stored/mutable "player balance" column. Balances,
 * revenue and outstanding totals are always derived from the underlying
 * charge / payment / credit records so that every screen agrees by construction:
 *
 *   outstanding = charge.amount - payments - credits   (floored at 0)
 *   voided charges contribute 0
 *   revenue     = sum of payments actually recorded
 */

import type {
  Charge,
  ChargeStatus,
  ChargeView,
  ChargeWithActivity,
  Credit,
  ISODate,
  Payment,
} from './types'
import { sumCents } from './money'

export function paidCentsOf(payments: Payment[]): number {
  return sumCents(payments.map((p) => p.amountCents))
}

export function creditedCentsOf(credits: Credit[]): number {
  return sumCents(credits.map((c) => c.amountCents))
}

/** Remaining obligation on a charge. Voided charges owe nothing. */
export function outstandingCentsOf(
  charge: Charge,
  payments: Payment[],
  credits: Credit[],
): number {
  if (charge.voidedAt) return 0
  const remaining = charge.amountCents - paidCentsOf(payments) - creditedCentsOf(credits)
  return Math.max(0, remaining)
}

/**
 * Derive the display status of a charge.
 *
 * Precedence mirrors the prototype's `payTone()`, extended with `partial`
 * (which the prototype had no concept of) for charges carrying some payment
 * but not yet settled.
 */
export function chargeStatusOf(
  charge: Charge,
  payments: Payment[],
  credits: Credit[],
  today: ISODate,
): ChargeStatus {
  if (charge.voidedAt) return 'voided'

  const paid = paidCentsOf(payments)
  const credited = creditedCentsOf(credits)
  const outstanding = Math.max(0, charge.amountCents - paid - credited)

  if (outstanding === 0) {
    // Settled. Money received wins the label over a pure write-down.
    if (paid > 0) return 'paid'
    return 'credited'
  }
  if (charge.dueDate < today) return 'overdue'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

/** Fully derived view of one charge. */
export function viewCharge(item: ChargeWithActivity, today: ISODate): ChargeView {
  const { charge, payments, credits } = item
  const paidCents = paidCentsOf(payments)
  const creditedCents = creditedCentsOf(credits)
  const outstandingCents = outstandingCentsOf(charge, payments, credits)
  const status = chargeStatusOf(charge, payments, credits, today)
  return {
    charge,
    amountCents: charge.amountCents,
    paidCents,
    creditedCents,
    outstandingCents,
    status,
    isPending: !charge.voidedAt && outstandingCents > 0,
    isOverdue: !charge.voidedAt && outstandingCents > 0 && charge.dueDate < today,
  }
}

export function viewCharges(items: ChargeWithActivity[], today: ISODate): ChargeView[] {
  return items.map((item) => viewCharge(item, today))
}

/** Total still owed across a set of charges. */
export function outstandingTotal(views: ChargeView[]): number {
  return sumCents(views.map((v) => v.outstandingCents))
}

/** Money actually collected across a set of charges. */
export function collectedTotal(views: ChargeView[]): number {
  return sumCents(views.map((v) => v.paidCents))
}

/** What a single player still owes. */
export function playerOutstanding(views: ChargeView[], playerId: string): number {
  return outstandingTotal(views.filter((v) => v.charge.playerId === playerId))
}

/** What is still owed against a single session. */
export function sessionOutstanding(views: ChargeView[], sessionId: string): number {
  return outstandingTotal(views.filter((v) => v.charge.sessionId === sessionId))
}

export function pendingViews(views: ChargeView[]): ChargeView[] {
  return views.filter((v) => v.isPending)
}

export function overdueViews(views: ChargeView[]): ChargeView[] {
  return views.filter((v) => v.isOverdue)
}

/**
 * Revenue for a period = payments received in that period.
 * Scheduled-but-uncollected charges are explicitly NOT revenue.
 */
export function revenueBetween(
  payments: Payment[],
  fromDate: ISODate,
  toDate: ISODate,
): number {
  return sumCents(
    payments.filter((p) => p.paidOn >= fromDate && p.paidOn <= toDate).map((p) => p.amountCents),
  )
}

/**
 * How much a "Mark Paid" action should record: exactly the remaining balance.
 * Returns 0 for charges that are already settled or voided.
 */
export function markPaidAmount(view: ChargeView): number {
  return view.outstandingCents
}

/** Guard: a credit may never exceed what is still outstanding. */
export function creditFits(view: ChargeView, creditCents: number): boolean {
  return creditCents > 0 && creditCents <= view.outstandingCents
}

/** Guard: a payment may never exceed what is still outstanding. */
export function paymentFits(view: ChargeView, paymentCents: number): boolean {
  return paymentCents > 0 && paymentCents <= view.outstandingCents
}

/** Badge colours, taken verbatim from the prototype's `payTone()`. */
export const CHARGE_TONE: Record<ChargeStatus, { label: string; bg: string; fg: string }> = {
  paid: { label: 'Paid', bg: '#E4F2E9', fg: '#2E7D4F' },
  voided: { label: 'Voided', bg: '#EDEDE8', fg: '#6B706C' },
  credited: { label: 'Credited', bg: '#EDEDE8', fg: '#6B706C' },
  overdue: { label: 'Overdue', bg: '#F7E9E6', fg: '#B3402F' },
  partial: { label: 'Partial', bg: '#F6EEDB', fg: '#96690F' },
  unpaid: { label: 'Unpaid', bg: '#F6EEDB', fg: '#96690F' },
}
