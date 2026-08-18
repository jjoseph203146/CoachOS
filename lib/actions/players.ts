'use server'

import { revalidatePath } from 'next/cache'
import { requireCoachAction } from '@/lib/auth'
import {
  archivePlayerSchema,
  deletePlayerSchema,
  playerFormSchema,
} from '@/lib/validation/schemas'
import {
  createPlayer,
  deletePlayer,
  setPlayerArchived,
  updatePlayer,
} from '@/lib/services/players'
import { ok, runAction, type ActionResult } from './result'

export interface PlayerFormInput {
  playerId?: string
  name: string
  phone: string
  email: string
  level: string
  rate: string
  notes: string
}

export async function savePlayerAction(
  input: PlayerFormInput,
): Promise<ActionResult<{ playerId: string }>> {
  return runAction('savePlayer', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = playerFormSchema.parse(input)

    const payload = {
      name: data.name,
      phone: data.phone,
      email: data.email,
      level: data.level,
      defaultRateCents: data.rate,
      notes: data.notes,
    }

    const player = data.playerId
      ? await updatePlayer(store, coachId, data.playerId, payload)
      : await createPlayer(store, coachId, payload)

    revalidatePath('/players')
    revalidatePath(`/players/${player.id}`)
    revalidatePath('/dashboard')
    return ok({ playerId: player.id })
  })
}

export async function setPlayerArchivedAction(
  input: { playerId: string; archived: boolean },
): Promise<ActionResult> {
  return runAction('setPlayerArchived', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = archivePlayerSchema.parse(input)
    await setPlayerArchived(store, coachId, data.playerId, data.archived)
    revalidatePath('/players')
    revalidatePath(`/players/${data.playerId}`)
    return ok()
  })
}

export async function deletePlayerAction(
  input: { playerId: string; confirmation: string },
): Promise<ActionResult> {
  return runAction('deletePlayer', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = deletePlayerSchema.parse(input)
    await deletePlayer(store, coachId, data.playerId, data.confirmation)
    revalidatePath('/players')
    revalidatePath('/dashboard')
    return ok()
  })
}
