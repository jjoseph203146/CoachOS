/** Coach settings service. */

import type { DataStore } from '@/lib/data/store'
import type { AttendanceWindow, Coach, MembershipRole, Theme } from '@/lib/domain/types'
import { DomainError } from './errors'

export async function getSettings(store: DataStore, membershipId: string): Promise<Coach> {
  const coach = await store.getCoach(membershipId)
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

/**
 * Updates the signed-in member's profile, and — owners only — the shared
 * academy settings. A non-owner's business-field edits are silently dropped
 * here (the database's RLS policy would reject them anyway); only the
 * personal name/email change applies.
 */
export async function updateSettings(
  store: DataStore,
  membershipId: string,
  academyId: string,
  role: MembershipRole,
  patch: SettingsPatch,
): Promise<Coach> {
  if (!patch.name.trim()) throw new DomainError('INVALID', 'Name is required.')
  if (patch.defaultRateCents < 0) {
    throw new DomainError('INVALID', 'Default rate must be a number.')
  }

  const coach = await store.updateMembershipProfile(membershipId, {
    name: patch.name.trim(),
    email: patch.email.trim(),
  })

  if (role === 'owner') {
    const academy = await store.updateAcademySettings(academyId, {
      businessName: patch.businessName.trim(),
      defaultRateCents: patch.defaultRateCents,
      attendanceWindow: patch.attendanceWindow,
      theme: patch.theme,
      timezone: patch.timezone,
    })
    return { ...coach, ...academy }
  }

  return coach
}

/** Complete onboarding — records the member's name and, for an owner, the business and default rate. */
export async function completeOnboarding(
  store: DataStore,
  membershipId: string,
  academyId: string,
  role: MembershipRole,
  input: {
    name: string
    businessName: string
    defaultRateCents: number
    timezone?: string
  },
): Promise<Coach> {
  if (!input.name.trim()) throw new DomainError('INVALID', 'Enter your name.')

  const coach = await store.updateMembershipProfile(membershipId, {
    name: input.name.trim(),
    onboardedAt: new Date().toISOString(),
  })

  if (role === 'owner') {
    const academy = await store.updateAcademySettings(academyId, {
      businessName: input.businessName.trim(),
      defaultRateCents: input.defaultRateCents,
      ...(input.timezone ? { timezone: input.timezone } : {}),
    })
    return { ...coach, ...academy }
  }

  return coach
}
