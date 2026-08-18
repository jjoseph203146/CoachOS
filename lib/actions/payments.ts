'use server'

import { revalidatePath } from 'next/cache'
import { requireCoachAction } from '@/lib/auth'
import {
  createManualCharge,
  getChargeView,
  markUnpaid,
  recordCredit,
  recordPayment,
} from '@/lib/services/finance'
import {
  manualChargeSchema,
  markPaidSchema,
  markUnpaidSchema,
  recordCreditSchema,
  recordPaymentSchema,
} from '@/lib/validation/schemas'
import { ok, runAction, type ActionResult } from './result'

function revalidateMoneyViews() {
  revalidatePath('/payments')
  revalidatePath('/dashboard')
  revalidatePath('/players')
}

/**
 * Mark a charge fully paid.
 *
 * The amount is computed on the server from the charge's own records — the
 * browser never gets to say how much money was collected. `expectedOutstanding`
 * is only used to detect that the charge changed underneath the user, which is
 * what makes a double-tap safe.
 */
export async function markPaidAction(input: {
  chargeId: string
  expectedOutstanding: number
}): Promise<ActionResult> {
  return runAction('markPaid', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = markPaidSchema.parse(input)
    const view = await getChargeView(store, coachId, data.chargeId)

    await recordPayment(store, coachId, {
      chargeId: data.chargeId,
      amountCents: view.outstandingCents,
      expectedOutstandingCents: data.expectedOutstanding,
    })

    revalidateMoneyViews()
    return ok()
  })
}

/** Record a partial (or full) payment of a coach-specified amount. */
export async function recordPaymentAction(input: {
  chargeId: string
  amount: string
  expectedOutstanding?: number
  note?: string
}): Promise<ActionResult> {
  return runAction('recordPayment', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = recordPaymentSchema.parse(input)

    await recordPayment(store, coachId, {
      chargeId: data.chargeId,
      amountCents: data.amount,
      expectedOutstandingCents: data.expectedOutstanding,
      note: data.note,
    })

    revalidateMoneyViews()
    return ok()
  })
}

export async function markUnpaidAction(input: {
  chargeId: string
}): Promise<ActionResult> {
  return runAction('markUnpaid', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = markUnpaidSchema.parse(input)
    await markUnpaid(store, coachId, data.chargeId)
    revalidateMoneyViews()
    return ok()
  })
}

export async function recordCreditAction(input: {
  chargeId: string
  amount: string
  reason?: string
}): Promise<ActionResult> {
  return runAction('recordCredit', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = recordCreditSchema.parse(input)
    await recordCredit(store, coachId, {
      chargeId: data.chargeId,
      amountCents: data.amount,
      reason: data.reason,
    })
    revalidateMoneyViews()
    return ok()
  })
}

export async function createManualChargeAction(input: {
  playerId: string
  amount: string
  dueDate: string
  label: string
}): Promise<ActionResult> {
  return runAction('createManualCharge', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = manualChargeSchema.parse(input)
    await createManualCharge(store, coachId, {
      playerId: data.playerId,
      amountCents: data.amount,
      dueDate: data.dueDate,
      label: data.label,
    })
    revalidateMoneyViews()
    return ok()
  })
}
