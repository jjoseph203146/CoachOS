'use server'

import { revalidatePath } from 'next/cache'
import { requireOwnerAction } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import { recordRevenue } from '@/lib/services/revenue'
import { recordRevenueSchema } from '@/lib/validation/schemas'
import { ok, runAction, type ActionResult } from './result'

/** Owner only: money received that no existing charge covers. */
export async function recordRevenueAction(input: {
  playerId: string
  amount: string
  category: string
  paidOn: string
  note: string
}): Promise<ActionResult> {
  return runAction('recordRevenue', async () => {
    const { store, coachId, coach, role } = await requireOwnerAction()
    const data = recordRevenueSchema.parse(input)
    await recordRevenue(
      store,
      coachId,
      role,
      {
        playerId: data.playerId,
        amountCents: data.amount,
        category: data.category,
        paidOn: data.paidOn,
        note: data.note,
      },
      coachClock(coach).today,
    )
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidatePath('/players')
    return ok()
  })
}
