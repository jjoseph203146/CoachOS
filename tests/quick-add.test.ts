import { describe, expect, it } from 'vitest'
import { createTestStore } from '@/lib/data/mock/store'
import { buildQuickAddInput } from '@/lib/domain/quickAdd'
import { createPlayer } from '@/lib/services/players'
import { playerFormSchema } from '@/lib/validation/schemas'

/**
 * Quick Add Person collects a first name, a last name and an optional phone,
 * and saves through the same validation and service as the full player form.
 */

const build = (firstName: string, lastName: string, phone = '') =>
  buildQuickAddInput({ firstName, lastName, phone })

describe('buildQuickAddInput', () => {
  it('joins the names and fills the rest of the profile with the form defaults', () => {
    const result = build('  Maya ', 'Thompson', ' (706) 555-0142 ')
    expect(result).toEqual({
      ok: true,
      input: {
        name: 'Maya Thompson',
        phone: '(706) 555-0142',
        email: '',
        level: 'Beginner',
        rate: '',
        notes: '',
      },
    })
  })

  it('needs both names, and says which one is missing', () => {
    expect(build('', 'Thompson')).toEqual({ ok: false, error: 'Enter a first name.' })
    expect(build('Maya', '   ')).toEqual({ ok: false, error: 'Enter a last name.' })
  })

  it('collapses stray spaces inside a name', () => {
    const result = build('Mary  Ann', 'De   Luca')
    expect(result.ok && result.input.name).toBe('Mary Ann De Luca')
  })

  it('produces input the full player form’s validation accepts, with or without a phone', () => {
    for (const phone of ['', '7065550142']) {
      const result = build('Maya', 'Thompson', phone)
      if (!result.ok) throw new Error('expected ok')
      expect(playerFormSchema.safeParse(result.input).success).toBe(true)
    }
  })

  it('leaves a bad phone number for the form’s validation to reject', () => {
    const result = build('Maya', 'Thompson', 'abc')
    if (!result.ok) throw new Error('expected ok')
    expect(playerFormSchema.safeParse(result.input).success).toBe(false)
  })
})

describe('saving a quick-added person', () => {
  it.each(['owner', 'coach'] as const)('creates the player with no personal rate for a %s', async (role) => {
    const { store, coachId } = createTestStore('established')
    const before = (await store.listPlayers(coachId)).length

    const built = build('Maya', 'Thompson', '7065550142')
    if (!built.ok) throw new Error('expected ok')
    const data = playerFormSchema.parse(built.input)
    const player = await createPlayer(
      store,
      coachId,
      {
        name: data.name,
        phone: data.phone,
        email: data.email,
        level: data.level,
        defaultRateCents: data.rate,
        notes: data.notes,
      },
      role,
    )

    expect(player).toMatchObject({
      name: 'Maya Thompson',
      phone: '7065550142',
      level: 'Beginner',
      defaultRateCents: null,
      archived: false,
    })
    expect((await store.listPlayers(coachId)).length).toBe(before + 1)
  })
})
