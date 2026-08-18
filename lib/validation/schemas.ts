/**
 * Server-side validation. Every mutation validates here before any domain
 * logic runs — values arriving from the browser are never trusted, including
 * money amounts, ownership ids and status transitions.
 */

import { z } from 'zod'
import { parseMoneyToCents } from '@/lib/domain/money'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const isoDate = z.string().regex(ISO_DATE, 'Enter a valid date.')

export const id = z.string().min(1, 'Missing identifier.').max(128)

/** Money arrives as a user-typed string and becomes integer cents. */
export const moneyCents = z
  .string()
  .transform((value, ctx) => {
    const cents = parseMoneyToCents(value)
    if (cents === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid amount.' })
      return z.NEVER
    }
    return cents
  })

export const optionalMoneyCents = z
  .string()
  .transform((value, ctx) => {
    if (value.trim() === '') return null
    const cents = parseMoneyToCents(value)
    if (cents === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid amount.' })
      return z.NEVER
    }
    return cents
  })

export const playerLevel = z.enum(['Beginner', 'Intermediate', 'Advanced'])

export const attendanceStatus = z.enum(['unmarked', 'present', 'absent', 'skipped'])

export const emailOptional = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: 'That email doesn’t look right.',
  })

export const phoneOptional = z
  .string()
  .trim()
  .max(40)
  .refine((v) => v === '' || /^[\d\s()+.\-]{7,}$/.test(v), {
    message: 'That phone number doesn’t look right.',
  })

// ---- players ----

export const playerFormSchema = z.object({
  playerId: id.optional(),
  name: z.string().trim().min(1, 'Player name is required.').max(120),
  phone: phoneOptional,
  email: emailOptional,
  level: playerLevel,
  rate: optionalMoneyCents,
  notes: z.string().trim().max(4000),
})

export const archivePlayerSchema = z.object({
  playerId: id,
  archived: z.coerce.boolean(),
})

export const deletePlayerSchema = z.object({
  playerId: id,
  confirmation: z.string().trim().min(1, 'Type the player’s name to confirm.'),
})

// ---- sessions ----

const startMin = z.coerce
  .number()
  .int()
  .min(0, 'Enter a valid time.')
  .max(24 * 60 - 1, 'Enter a valid time.')

const durationMin = z.coerce
  .number()
  .int()
  .min(5, 'Sessions must be at least 5 minutes.')
  .max(8 * 60, 'That session is unusually long.')

export const createSessionSchema = z
  .object({
    type: z.enum(['private', 'group']),
    name: z.string().trim().max(140),
    date: isoDate,
    startMin,
    durationMin,
    isFree: z.coerce.boolean(),
    price: z.string(),
    location: z.string().trim().max(140),
    capacity: z.coerce.number().int().min(2).max(12).nullable().optional(),
    playerIds: z.array(id).min(1, 'Choose at least one player.'),
    allowConflict: z.coerce.boolean().optional(),
  })
  .transform((value, ctx) => {
    let priceCents = 0
    if (!value.isFree) {
      const parsed = parseMoneyToCents(value.price)
      if (parsed === null || parsed <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['price'],
          message: 'Set a price, or mark the session free.',
        })
        return z.NEVER
      }
      priceCents = parsed
    }
    return { ...value, priceCents }
  })

export const updateSessionSchema = z
  .object({
    sessionId: id,
    name: z.string().trim().min(1, 'Session needs a name.').max(140),
    date: isoDate,
    startMin,
    durationMin,
    price: z.string(),
    location: z.string().trim().max(140),
    capacity: z.coerce.number().int().min(2).max(12).nullable().optional(),
    priceChangeDecision: z.enum(['keep', 'update']).optional(),
  })
  .transform((value, ctx) => {
    const parsed = parseMoneyToCents(value.price)
    if (value.price.trim() !== '' && parsed === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Enter a valid price.',
      })
      return z.NEVER
    }
    return { ...value, priceCents: parsed ?? 0 }
  })

export const cancelSessionSchema = z.object({
  sessionId: id,
  chargeDecision: z.enum(['void', 'keep']),
})

export const sessionPlayerSchema = z.object({
  sessionId: id,
  playerId: id,
})

export const removePlayerSchema = z.object({
  sessionId: id,
  playerId: id,
  chargeDecision: z.enum(['keep', 'credit']),
})

// ---- attendance ----

export const saveAttendanceSchema = z.object({
  sessionId: id,
  marks: z
    .array(z.object({ playerId: id, attendance: attendanceStatus }))
    .max(50, 'Too many players.'),
})

export const skipAttendanceSchema = z.object({ sessionId: id })

// ---- payments ----

export const recordPaymentSchema = z.object({
  chargeId: id,
  amount: moneyCents,
  /** Optimistic guard against double submission. */
  expectedOutstanding: z.coerce.number().int().nonnegative().optional(),
  note: z.string().trim().max(400).optional(),
})

export const markPaidSchema = z.object({
  chargeId: id,
  expectedOutstanding: z.coerce.number().int().nonnegative(),
})

export const markUnpaidSchema = z.object({ chargeId: id })

export const recordCreditSchema = z.object({
  chargeId: id,
  amount: moneyCents,
  reason: z.string().trim().max(400).optional(),
})

export const manualChargeSchema = z.object({
  playerId: id,
  amount: moneyCents,
  dueDate: isoDate,
  label: z.string().trim().max(140),
})

// ---- settings / onboarding ----

export const settingsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  email: emailOptional,
  businessName: z.string().trim().max(140),
  rate: moneyCents,
  attendanceWindow: z.enum(['Same day', '24 hours', '48 hours', '72 hours']),
  theme: z.enum(['Light', 'Dark']),
})

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  businessName: z.string().trim().max(140),
  rate: moneyCents,
})

// ---- auth ----

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
})

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(120),
    email: z.string().trim().email('Enter a valid email.'),
    password: z.string().min(8, 'Use at least 8 characters.').max(200),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    path: ['confirm'],
    message: 'Passwords don’t match.',
  })
