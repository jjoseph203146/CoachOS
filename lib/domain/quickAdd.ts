/**
 * Quick Add Person collects the least that identifies someone — a first and last
 * name, and optionally a phone number — and fills the rest of a player's profile
 * with the same defaults the full form starts from. The profile can be finished
 * later; this is not a second kind of player.
 */

export interface QuickAddFields {
  firstName: string
  lastName: string
  phone: string
}

/** The shape `savePlayerAction` accepts (the full player form's fields). */
export interface QuickAddPlayerInput {
  name: string
  phone: string
  email: string
  level: string
  rate: string
  notes: string
}

export function buildQuickAddInput(
  fields: QuickAddFields,
): { ok: true; input: QuickAddPlayerInput } | { ok: false; error: string } {
  const firstName = fields.firstName.trim().replace(/\s+/g, ' ')
  const lastName = fields.lastName.trim().replace(/\s+/g, ' ')
  if (!firstName) return { ok: false, error: 'Enter a first name.' }
  if (!lastName) return { ok: false, error: 'Enter a last name.' }
  return {
    ok: true,
    input: {
      name: `${firstName} ${lastName}`,
      phone: fields.phone.trim(),
      email: '',
      level: 'Beginner',
      // No rate: the person uses the academy default until an owner sets one.
      rate: '',
      notes: '',
    },
  }
}
