'use server'

import { revalidatePath } from 'next/cache'
import { requireCoachAction } from '@/lib/auth'
import { defaultClock } from '@/lib/services/players'
import {
  addPlayerToSession,
  cancelSession,
  createSession,
  removePlayerFromSession,
  saveAttendance,
  skipAttendance,
  updateSession,
} from '@/lib/services/sessions'
import {
  cancelSessionSchema,
  createSessionSchema,
  removePlayerSchema,
  saveAttendanceSchema,
  sessionPlayerSchema,
  skipAttendanceSchema,
  updateSessionSchema,
} from '@/lib/validation/schemas'
import { ok, runAction, type ActionResult } from './result'

function revalidateSessionViews(sessionId?: string) {
  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  revalidatePath('/payments')
  revalidatePath('/players')
  if (sessionId) revalidatePath(`/sessions/${sessionId}`)
}

export async function createSessionAction(input: {
  type: 'private' | 'group'
  name: string
  date: string
  startMin: number
  durationMin: number
  isFree: boolean
  price: string
  location: string
  capacity: number | null
  playerIds: string[]
  allowConflict?: boolean
}): Promise<ActionResult<{ sessionId: string }>> {
  return runAction('createSession', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = createSessionSchema.parse(input)

    const session = await createSession(store, coachId, {
      type: data.type,
      name: data.name,
      date: data.date,
      startMin: data.startMin,
      durationMin: data.durationMin,
      priceCents: data.priceCents,
      isFree: data.isFree,
      location: data.location,
      capacity: data.type === 'group' ? (data.capacity ?? 6) : null,
      playerIds: data.playerIds,
      allowConflict: data.allowConflict,
    })

    revalidateSessionViews(session.id)
    return ok({ sessionId: session.id })
  })
}

export async function updateSessionAction(input: {
  sessionId: string
  name: string
  date: string
  startMin: number
  durationMin: number
  price: string
  location: string
  capacity: number | null
  priceChangeDecision?: 'keep' | 'update'
}): Promise<ActionResult<{ requiresPriceDecision: boolean; unpaidCount: number }>> {
  return runAction('updateSession', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = updateSessionSchema.parse(input)

    const result = await updateSession(store, coachId, data.sessionId, {
      name: data.name,
      date: data.date,
      startMin: data.startMin,
      durationMin: data.durationMin,
      priceCents: data.priceCents,
      location: data.location,
      capacity: data.capacity ?? null,
      priceChangeDecision: data.priceChangeDecision,
    })

    revalidateSessionViews(data.sessionId)
    return ok(result)
  })
}

export async function cancelSessionAction(input: {
  sessionId: string
  chargeDecision: 'void' | 'keep'
}): Promise<ActionResult> {
  return runAction('cancelSession', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = cancelSessionSchema.parse(input)
    await cancelSession(store, coachId, data.sessionId, data.chargeDecision)
    revalidateSessionViews(data.sessionId)
    return ok()
  })
}

export async function addPlayerToSessionAction(input: {
  sessionId: string
  playerId: string
}): Promise<ActionResult> {
  return runAction('addPlayerToSession', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = sessionPlayerSchema.parse(input)
    await addPlayerToSession(store, coachId, data.sessionId, data.playerId)
    revalidateSessionViews(data.sessionId)
    return ok()
  })
}

export async function removePlayerFromSessionAction(input: {
  sessionId: string
  playerId: string
  chargeDecision: 'keep' | 'credit'
}): Promise<ActionResult> {
  return runAction('removePlayerFromSession', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = removePlayerSchema.parse(input)
    await removePlayerFromSession(
      store,
      coachId,
      data.sessionId,
      data.playerId,
      data.chargeDecision,
    )
    revalidateSessionViews(data.sessionId)
    return ok()
  })
}

export async function saveAttendanceAction(input: {
  sessionId: string
  marks: Array<{ playerId: string; attendance: 'unmarked' | 'present' | 'absent' | 'skipped' }>
}): Promise<ActionResult> {
  return runAction('saveAttendance', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = saveAttendanceSchema.parse(input)
    await saveAttendance(store, coachId, data.sessionId, data.marks)
    revalidateSessionViews(data.sessionId)
    return ok()
  })
}

export async function skipAttendanceAction(input: {
  sessionId: string
}): Promise<ActionResult> {
  return runAction('skipAttendance', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = skipAttendanceSchema.parse(input)
    await skipAttendance(store, coachId, data.sessionId)
    revalidateSessionViews(data.sessionId)
    return ok()
  })
}

/** Used by the Duplicate action to prefill the New Session form. */
export async function duplicateSessionDraftAction(input: {
  sessionId: string
}): Promise<ActionResult<Record<string, unknown>>> {
  return runAction('duplicateSessionDraft', async () => {
    const { store, coachId } = await requireCoachAction()
    const { buildDuplicateDraft } = await import('@/lib/services/sessions')
    const draft = await buildDuplicateDraft(
      store,
      coachId,
      input.sessionId,
      defaultClock(),
    )
    return ok(draft as unknown as Record<string, unknown>)
  })
}
