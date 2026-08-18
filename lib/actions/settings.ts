'use server'

import { revalidatePath } from 'next/cache'
import { requireCoachAction } from '@/lib/auth'
import { completeOnboarding, updateSettings } from '@/lib/services/settings'
import { onboardingSchema, settingsSchema } from '@/lib/validation/schemas'
import { ok, runAction, type ActionResult } from './result'

export async function updateSettingsAction(input: {
  name: string
  email: string
  businessName: string
  rate: string
  attendanceWindow: string
  theme: string
  timezone: string
}): Promise<ActionResult> {
  return runAction('updateSettings', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = settingsSchema.parse(input)
    await updateSettings(store, coachId, {
      name: data.name,
      email: data.email,
      businessName: data.businessName,
      defaultRateCents: data.rate,
      attendanceWindow: data.attendanceWindow,
      theme: data.theme,
      timezone: data.timezone,
    })
    revalidatePath('/settings')
    revalidatePath('/dashboard')
    return ok()
  })
}

export async function completeOnboardingAction(input: {
  name: string
  businessName: string
  rate: string
  timezone?: string
}): Promise<ActionResult> {
  return runAction('completeOnboarding', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = onboardingSchema.parse(input)
    await completeOnboarding(store, coachId, {
      name: data.name,
      businessName: data.businessName,
      defaultRateCents: data.rate,
      timezone: data.timezone,
    })
    revalidatePath('/dashboard')
    return ok()
  })
}
