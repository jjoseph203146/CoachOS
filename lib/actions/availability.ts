'use server'

import { revalidatePath } from 'next/cache'
import { requireCoachAction } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import { saveAvailability, type SaveAvailabilityResult } from '@/lib/services/availability'
import { saveAvailabilitySchema } from '@/lib/validation/schemas'
import { ok, runAction, type ActionResult } from './result'

/** Saves the signed-in coach's own weekly hours. Someone else's can't be named. */
export async function saveAvailabilityAction(input: {
  windows: Array<{ weekday: number; startMin: number; endMin: number }>
}): Promise<ActionResult<SaveAvailabilityResult>> {
  return runAction('saveAvailability', async () => {
    const { store, coachId, coach, membershipId } = await requireCoachAction()
    const data = saveAvailabilitySchema.parse(input)
    const result = await saveAvailability(
      store,
      coachId,
      membershipId,
      data.windows,
      coachClock(coach).today,
    )
    if (result.saved) {
      revalidatePath('/settings/availability')
      revalidatePath('/schedule/new')
    }
    return ok(result)
  })
}
