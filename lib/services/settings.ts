/** Coach settings service. */

import type { DataStore } from '@/lib/data/store'
import type { AttendanceWindow, Coach, Theme } from '@/lib/domain/types'
import { DomainError } from './errors'

export async function getSettings(store: DataStore, coachId: string): Promise<Coach> {
  const coach = await store.getCoach(coachId)
  if (!coach) throw new DomainError('NOT_FOUND', 'Coach profile not found.')
  return coach
}

export interface SettingsPatch {
  name: string
  email: string
  businessName: string
  defaultRateCents: number
  attendanceWindow: AttendanceWindow
  theme: Theme
  timezone: string
}

export async function updateSettings(
  store: DataStore,
  coachId: string,
  patch: SettingsPatch,
): Promise<Coach> {
  if (!patch.name.trim()) throw new DomainError('INVALID', 'Name is required.')
  if (patch.defaultRateCents < 0) {
    throw new DomainError('INVALID', 'Default rate must be a number.')
  }
  return store.updateCoach(coachId, {
    name: patch.name.trim(),
    email: patch.email.trim(),
    businessName: patch.businessName.trim(),
    defaultRateCents: patch.defaultRateCents,
    attendanceWindow: patch.attendanceWindow,
    theme: patch.theme,
    timezone: patch.timezone,
  })
}

/** Complete onboarding — records the coach's name, business and default rate. */
export async function completeOnboarding(
  store: DataStore,
  coachId: string,
  input: {
    name: string
    businessName: string
    defaultRateCents: number
    timezone?: string
  },
): Promise<Coach> {
  if (!input.name.trim()) throw new DomainError('INVALID', 'Enter your name.')
  return store.updateCoach(coachId, {
    name: input.name.trim(),
    businessName: input.businessName.trim(),
    defaultRateCents: input.defaultRateCents,
    ...(input.timezone ? { timezone: input.timezone } : {}),
    onboardedAt: new Date().toISOString(),
  })
}
