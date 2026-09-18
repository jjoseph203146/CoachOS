'use server'

import { revalidatePath } from 'next/cache'
import { requireCoachAction, requireOwnerAction } from '@/lib/auth'
import {
  inviteCoach,
  removeMember,
  revokeInvite,
  setSessionCoaches,
} from '@/lib/services/team'
import {
  inviteCoachSchema,
  memberIdSchema,
  inviteIdSchema,
  setSessionCoachesSchema,
} from '@/lib/validation/schemas'
import { ok, runAction, type ActionResult } from './result'

/**
 * Creates an invitation and returns its secret token so the owner can share
 * the link. (There is no email service: the link IS the invitation.)
 */
export async function inviteCoachAction(input: {
  email: string
}): Promise<ActionResult<{ token: string; email: string }>> {
  return runAction('inviteCoach', async () => {
    const { store, coachId, membershipId, role } = await requireOwnerAction()
    const data = inviteCoachSchema.parse(input)
    const invite = await inviteCoach(store, coachId, role, membershipId, data.email)
    revalidatePath('/settings/team')
    return ok({ token: invite.token, email: invite.email })
  })
}

export async function revokeInviteAction(input: { inviteId: string }): Promise<ActionResult> {
  return runAction('revokeInvite', async () => {
    const { store, coachId, role } = await requireOwnerAction()
    const data = inviteIdSchema.parse(input)
    await revokeInvite(store, coachId, role, data.inviteId)
    revalidatePath('/settings/team')
    return ok()
  })
}

export async function removeMemberAction(input: { membershipId: string }): Promise<ActionResult> {
  return runAction('removeMember', async () => {
    const { store, coachId, membershipId, role } = await requireOwnerAction()
    const data = memberIdSchema.parse(input)
    await removeMember(store, coachId, role, membershipId, data.membershipId)
    revalidatePath('/settings/team')
    revalidatePath('/dashboard')
    return ok()
  })
}

/** Any member records who was on court, as part of taking attendance. */
export async function setSessionCoachesAction(input: {
  sessionId: string
  membershipIds: string[]
}): Promise<ActionResult> {
  return runAction('setSessionCoaches', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = setSessionCoachesSchema.parse(input)
    await setSessionCoaches(store, coachId, data.sessionId, data.membershipIds)
    revalidatePath(`/sessions/${data.sessionId}`)
    return ok()
  })
}
