/**
 * Programs — recurring group offerings with price OPTIONS and per-participant
 * price AGREEMENTS.
 *
 * The rules that matter, all mirrored by database triggers (migration 0008):
 *
 *  - A program has no price of its own, only options ("Weekly $150",
 *    "Drop-in $35"). Only the owner defines or changes them.
 *  - Enrolling a participant SNAPSHOTS their agreement. A coach may enrol
 *    someone at a standard option; agreeing a different (custom) price is the
 *    owner's call.
 *  - A charge for a participant copies the agreed amount, basis and standard.
 *    Changing or archiving an option afterwards never touches an agreement or
 *    a charge that exists — it only affects who enrols from then on.
 */

import type { DataStore } from '@/lib/data/store'
import { addDays } from '@/lib/domain/dates'
import { billingPeriod, isRecurringBasis, occurrenceDates } from '@/lib/domain/programs'
import type {
  ISODate,
  MembershipRole,
  PriceBasis,
  Program,
  ProgramAudience,
  ProgramEnrollment,
  ProgramPriceOption,
  Session,
} from '@/lib/domain/types'
import { DomainError } from './errors'

/** How far ahead occurrences are generated. */
export const HORIZON_DAYS = 56

function requireOwner(role: MembershipRole, what: string) {
  if (role !== 'owner') {
    throw new DomainError('FORBIDDEN', `Only the academy owner can ${what}.`)
  }
}

async function loadProgram(store: DataStore, coachId: string, programId: string): Promise<Program> {
  const program = await store.getProgram(coachId, programId)
  if (!program) throw new DomainError('NOT_FOUND', 'That program could not be found.')
  return program
}

// ---- reading ----

export interface ProgramListItem {
  program: Program
  activeCount: number
  nextOccurrence: Session | null
}

export async function listPrograms(
  store: DataStore,
  coachId: string,
  today: ISODate,
): Promise<ProgramListItem[]> {
  const [programs, roster, sessions] = await Promise.all([
    store.listPrograms(coachId),
    store.listProgramEnrollments(coachId),
    store.listSessions(coachId),
  ])
  return programs
    .map((program) => ({
      program,
      activeCount: roster.filter((r) => r.programId === program.id && r.status === 'active')
        .length,
      nextOccurrence:
        sessions
          .filter(
            (s) =>
              s.programId === program.id && s.status !== 'cancelled' && s.date >= today,
          )
          .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))[0] ??
        null,
    }))
    .sort((a, b) => a.program.name.localeCompare(b.program.name))
}

export interface RosterRow {
  enrollment: ProgramEnrollment
  playerName: string
  /** The end of the latest billed period, if any. */
  lastChargeEnd: ISODate | null
  /** Live (non-voided) charges raised against this place. */
  chargeCount: number
}

export interface ProgramDetail {
  program: Program
  /** Active options first, then archived, each in position order. */
  options: ProgramPriceOption[]
  roster: RosterRow[]
  upcoming: Session[]
}

export async function loadProgramDetail(
  store: DataStore,
  coachId: string,
  programId: string,
  today: ISODate,
): Promise<ProgramDetail> {
  const program = await loadProgram(store, coachId, programId)
  const [options, enrollments, players, sessions, charges] = await Promise.all([
    store.listPriceOptions(coachId),
    store.listProgramEnrollments(coachId),
    store.listPlayers(coachId, { includeDeleted: true }),
    store.listSessions(coachId),
    store.listCharges(coachId),
  ])
  const names = new Map(players.map((p) => [p.id, p.name]))

  return {
    program,
    options: options
      .filter((o) => o.programId === programId)
      .sort(
        (a, b) =>
          Number(!!a.archivedAt) - Number(!!b.archivedAt) || a.position - b.position,
      ),
    roster: enrollments
      .filter((e) => e.programId === programId && e.status === 'active')
      .map((enrollment) => ({
        enrollment,
        playerName: names.get(enrollment.playerId) ?? 'Unknown player',
        lastChargeEnd:
          charges
            .filter((c) => c.programEnrollmentId === enrollment.id && !c.voidedAt)
            .map((c) => c.periodEnd)
            .filter((d): d is ISODate => !!d)
            .sort()
            .pop() ?? null,
        chargeCount: charges.filter((c) => c.programEnrollmentId === enrollment.id && !c.voidedAt)
          .length,
      }))
      .sort((a, b) => a.playerName.localeCompare(b.playerName)),
    upcoming: sessions
      .filter((s) => s.programId === programId && s.status !== 'cancelled' && s.date >= today)
      .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1)),
  }
}

// ---- defining (owner) ----

export interface NewOptionArgs {
  label: string
  basis: PriceBasis
  amountCents: number
}

export interface CreateProgramArgs {
  name: string
  audience: ProgramAudience
  weekdays: number[]
  startMin: number
  durationMin: number
  location: string
  capacity: number | null
  ageRange: string
  startsOn: ISODate
  endsOn: ISODate | null
  options: NewOptionArgs[]
}

export async function createProgram(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  args: CreateProgramArgs,
  today: ISODate,
): Promise<Program> {
  requireOwner(role, 'create a program')
  if (!args.name.trim()) throw new DomainError('INVALID', 'Give the program a name.')
  if (args.weekdays.length === 0) {
    throw new DomainError('INVALID', 'Choose at least one day the program meets.')
  }
  if (args.options.length === 0) {
    throw new DomainError('INVALID', 'Add at least one price option (it can be $0).')
  }
  if (args.endsOn && args.endsOn < args.startsOn) {
    throw new DomainError('INVALID', 'The end date is before the start date.')
  }

  const program = await store.createProgram(coachId, {
    name: args.name.trim(),
    audience: args.audience,
    weekdays: [...new Set(args.weekdays)].sort((a, b) => a - b),
    startMin: args.startMin,
    durationMin: args.durationMin,
    location: args.location.trim(),
    capacity: args.capacity,
    ageRange: args.ageRange.trim(),
    startsOn: args.startsOn,
    endsOn: args.endsOn,
  })
  for (const [position, option] of args.options.entries()) {
    await store.createPriceOption(coachId, {
      programId: program.id,
      label: option.label.trim(),
      basis: option.basis,
      amountCents: option.amountCents,
      position,
    })
  }
  await generateOccurrences(store, coachId, program.id, today, addDays(today, HORIZON_DAYS))
  return program
}

export async function addPriceOption(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  programId: string,
  option: NewOptionArgs,
): Promise<ProgramPriceOption> {
  requireOwner(role, 'change a program’s prices')
  await loadProgram(store, coachId, programId)
  if (!option.label.trim()) throw new DomainError('INVALID', 'Name the price option.')
  const existing = (await store.listPriceOptions(coachId)).filter((o) => o.programId === programId)
  return store.createPriceOption(coachId, {
    programId,
    label: option.label.trim(),
    basis: option.basis,
    amountCents: option.amountCents,
    position: existing.length,
  })
}

/**
 * Change an option's price. This is prospective by construction: existing
 * agreements and charges hold snapshots and are never read from this row.
 */
export async function updatePriceOption(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  optionId: string,
  patch: { label?: string; amountCents?: number },
): Promise<ProgramPriceOption> {
  requireOwner(role, 'change a program’s prices')
  if (patch.label !== undefined && !patch.label.trim()) {
    throw new DomainError('INVALID', 'Name the price option.')
  }
  return store.updatePriceOption(coachId, optionId, {
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
  })
}

/** Options are archived, never deleted, so agreements can still name them. */
export async function archivePriceOption(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  optionId: string,
): Promise<void> {
  requireOwner(role, 'change a program’s prices')
  await store.updatePriceOption(coachId, optionId, { archivedAt: new Date().toISOString() })
}

// ---- occurrences ----

/**
 * Create the program's sessions for [from, to] that don't exist yet, and put
 * the active roster on each one as EXPECTED. Safe to call repeatedly.
 */
export async function generateOccurrences(
  store: DataStore,
  coachId: string,
  programId: string,
  from: ISODate,
  to: ISODate,
): Promise<number> {
  const program = await loadProgram(store, coachId, programId)
  if (program.status !== 'active') return 0

  const [sessions, roster] = await Promise.all([
    store.listSessions(coachId),
    store.listProgramEnrollments(coachId),
  ])
  const have = new Set(sessions.filter((s) => s.programId === programId).map((s) => s.date))
  const dates = occurrenceDates(program, from, to).filter((date) => !have.has(date))
  const playerIds = roster
    .filter((r) => r.programId === programId && r.status === 'active')
    .map((r) => r.playerId)

  for (const date of dates) {
    const session = await store.createSession(coachId, {
      type: 'group',
      name: program.name,
      date,
      startMin: program.startMin,
      durationMin: program.durationMin,
      // Occurrences carry no price: charges come from each participant's agreement.
      priceCents: 0,
      isFree: false,
      location: program.location,
      capacity: program.capacity,
      programId,
    })
    await store.addEnrollments(coachId, session.id, playerIds, { expected: true })
  }
  return dates.length
}

/** Schedule the next stretch of weeks after the last occurrence that exists. */
export async function extendProgram(
  store: DataStore,
  coachId: string,
  programId: string,
  today: ISODate,
): Promise<number> {
  const sessions = await store.listSessions(coachId)
  const last = sessions
    .filter((s) => s.programId === programId)
    .map((s) => s.date)
    .sort()
    .pop()
  const from = last && last >= today ? addDays(last, 1) : today
  return generateOccurrences(store, coachId, programId, from, addDays(from, HORIZON_DAYS))
}

/** Stop a program: end every place and cancel its future occurrences. Charges are untouched. */
export async function endProgram(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  programId: string,
  today: ISODate,
): Promise<void> {
  requireOwner(role, 'end a program')
  await loadProgram(store, coachId, programId)
  const [sessions, roster] = await Promise.all([
    store.listSessions(coachId),
    store.listProgramEnrollments(coachId),
  ])
  const stamp = new Date().toISOString()
  for (const session of sessions) {
    if (session.programId === programId && session.status === 'scheduled' && session.date > today) {
      await store.updateSession(coachId, session.id, { status: 'cancelled', cancelledAt: stamp })
    }
  }
  for (const place of roster) {
    if (place.programId === programId && place.status === 'active') {
      await store.updateProgramEnrollment(coachId, place.id, { status: 'ended', endedOn: today })
    }
  }
  await store.updateProgram(coachId, programId, { status: 'ended', endsOn: today })
}

// ---- the roster and its agreements ----

export interface EnrollArgs {
  programId: string
  playerId: string
  /** The standard option chosen. */
  priceOptionId: string | null
  /**
   * A deliberately different price. OWNER ONLY. With an option it is a
   * discount/premium against that standard; without one it needs a label/basis.
   */
  customAmountCents: number | null
  customLabel?: string
  customBasis?: PriceBasis
  note: string
}

interface Agreement {
  source: 'program_option' | 'custom'
  optionId: string | null
  label: string
  basis: PriceBasis
  amountCents: number
  standardCents: number | null
}

/** Work out what is being agreed, and whether this actor is allowed to agree it. */
function resolveAgreement(
  args: EnrollArgs,
  options: ProgramPriceOption[],
  role: MembershipRole,
): Agreement {
  const option = args.priceOptionId
    ? options.find((o) => o.id === args.priceOptionId && o.programId === args.programId)
    : undefined
  if (args.priceOptionId && (!option || option.archivedAt)) {
    throw new DomainError('INVALID', 'Choose one of the program’s current price options.')
  }

  if (args.customAmountCents === null || (option && args.customAmountCents === option.amountCents)) {
    if (!option) throw new DomainError('INVALID', 'Choose a price option for this participant.')
    return {
      source: 'program_option',
      optionId: option.id,
      label: option.label,
      basis: option.basis,
      amountCents: option.amountCents,
      standardCents: option.amountCents,
    }
  }

  requireOwner(role, 'agree a custom price')
  if (!option && !args.customLabel?.trim()) {
    throw new DomainError('INVALID', 'Describe the custom price (e.g. “Scholarship”).')
  }
  return {
    source: 'custom',
    optionId: option?.id ?? null,
    label: option?.label ?? args.customLabel!.trim(),
    basis: option?.basis ?? args.customBasis ?? 'custom',
    amountCents: args.customAmountCents,
    standardCents: option?.amountCents ?? null,
  }
}

export async function enrollParticipant(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  args: EnrollArgs,
  today: ISODate,
): Promise<{ enrollment: ProgramEnrollment; charged: boolean }> {
  const program = await loadProgram(store, coachId, args.programId)
  if (program.status !== 'active') {
    throw new DomainError('CONFLICT', 'That program has ended.')
  }

  const player = await store.getPlayer(coachId, args.playerId)
  if (!player || player.deletedAt || player.archived) {
    throw new DomainError('FORBIDDEN', 'That player is not available.')
  }

  const [options, roster] = await Promise.all([
    store.listPriceOptions(coachId),
    store.listProgramEnrollments(coachId),
  ])
  const active = roster.filter((r) => r.programId === program.id && r.status === 'active')
  if (active.some((r) => r.playerId === player.id)) {
    throw new DomainError('CONFLICT', `${player.name} is already in this program.`)
  }
  if (program.capacity && active.length >= program.capacity) {
    throw new DomainError('CONFLICT', 'This program is full.')
  }

  const agreement = resolveAgreement(args, options, role)
  if (agreement.amountCents < 0) throw new DomainError('INVALID', 'Enter a valid amount.')

  const enrollment = await store.createProgramEnrollment(coachId, {
    programId: program.id,
    playerId: player.id,
    joinedOn: today,
    priceOptionId: agreement.optionId,
    agreedLabel: agreement.label,
    agreedBasis: agreement.basis,
    agreedAmountCents: agreement.amountCents,
    standardAmountCents: agreement.standardCents,
    agreementSource: agreement.source,
    agreementNote: args.note.trim(),
  })

  // Put them on the occurrences still to come, expected.
  const sessions = await store.listSessions(coachId)
  for (const session of sessions) {
    if (session.programId === program.id && session.status === 'scheduled' && session.date >= today) {
      await store.addEnrollment(coachId, session.id, player.id, { expected: true })
    }
  }

  const charged = await chargeForPlace(store, coachId, enrollment, program, today, {
    onlyIfUnbilled: true,
  })
  return { enrollment, charged }
}

/**
 * Create the charge a place currently owes, copying its AGREEMENT (never the
 * option's live price). Recurring bases bill the next period; a drop-in or
 * full-program place is billed once; per-session places are billed as they
 * attend (see `chargeAttendedParticipants`).
 */
async function chargeForPlace(
  store: DataStore,
  coachId: string,
  place: ProgramEnrollment,
  program: Program,
  today: ISODate,
  opts: { onlyIfUnbilled: boolean },
): Promise<boolean> {
  if (place.agreedBasis === 'per_session') return false
  if (place.agreedAmountCents <= 0) return false // nothing is owed (e.g. a scholarship)

  const charges = (await store.listCharges(coachId)).filter(
    (c) => c.programEnrollmentId === place.id && !c.voidedAt,
  )
  const recurring = isRecurringBasis(place.agreedBasis)

  let period: { start: ISODate; end: ISODate } | null = null
  if (recurring) {
    const lastEnd = charges
      .map((c) => c.periodEnd)
      .filter((d): d is ISODate => !!d)
      .sort()
      .pop()
    const start = lastEnd ? addDays(lastEnd, 1) : today > program.startsOn ? today : program.startsOn
    if (program.endsOn && start > program.endsOn) {
      throw new DomainError('CONFLICT', 'The program ends before another period would start.')
    }
    period = billingPeriod(place.agreedBasis, start)
  } else if (charges.length > 0) {
    if (opts.onlyIfUnbilled) return false
    throw new DomainError('CONFLICT', 'This place has already been billed.')
  }

  await store.createCharge(coachId, {
    playerId: place.playerId,
    sessionId: null,
    amountCents: place.agreedAmountCents,
    priceSource: place.agreementSource === 'program_option' ? 'program_option' : 'custom',
    priceBasis: place.agreedBasis,
    standardAmountCents: place.standardAmountCents,
    programId: program.id,
    programEnrollmentId: place.id,
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
    dueDate: period?.start ?? today,
    isManual: false,
    label: `${program.name} — ${place.agreedLabel}`,
    note: '',
  })
  return true
}

/** Bill a participant's next week/month, or a place whose first charge is missing. */
export async function billPlace(
  store: DataStore,
  coachId: string,
  enrollmentId: string,
  today: ISODate,
): Promise<void> {
  const place = (await store.listProgramEnrollments(coachId)).find((e) => e.id === enrollmentId)
  if (!place) throw new DomainError('NOT_FOUND', 'That roster place could not be found.')
  if (place.status !== 'active') throw new DomainError('CONFLICT', 'That place has ended.')
  if (place.agreedBasis === 'per_session') {
    throw new DomainError('INVALID', 'Per-session places are billed as they attend.')
  }
  const program = await loadProgram(store, coachId, place.programId)
  await chargeForPlace(store, coachId, place, program, today, { onlyIfUnbilled: false })
}

/** End a participant's place. History and charges stay; they leave future sessions. */
export async function endPlace(
  store: DataStore,
  coachId: string,
  enrollmentId: string,
  today: ISODate,
): Promise<void> {
  const place = (await store.listProgramEnrollments(coachId)).find((e) => e.id === enrollmentId)
  if (!place) throw new DomainError('NOT_FOUND', 'That roster place could not be found.')
  if (place.status === 'ended') return

  const [sessions, enrollments] = await Promise.all([
    store.listSessions(coachId),
    store.listEnrollments(coachId),
  ])
  await store.updateProgramEnrollment(coachId, place.id, { status: 'ended', endedOn: today })
  for (const session of sessions) {
    if (session.programId !== place.programId || session.status !== 'scheduled') continue
    if (session.date <= today) continue
    const onSession = enrollments.find(
      (e) => e.sessionId === session.id && e.playerId === place.playerId,
    )
    if (onSession && onSession.attendance === 'unmarked') {
      await store.removeEnrollment(coachId, session.id, place.playerId)
    }
  }
}

// ---- attendance hooks ----

/** Update the planning list for one occurrence. */
export async function setExpected(
  store: DataStore,
  coachId: string,
  sessionId: string,
  marks: Array<{ playerId: string; expected: boolean }>,
): Promise<void> {
  const session = await store.getSession(coachId, sessionId)
  if (!session) throw new DomainError('NOT_FOUND', 'That session could not be found.')
  if (session.status === 'cancelled') {
    throw new DomainError('CONFLICT', 'This session was cancelled.')
  }
  const enrolled = new Set(
    (await store.listEnrollmentsForSession(coachId, sessionId)).map((e) => e.playerId),
  )
  for (const mark of marks) {
    if (!enrolled.has(mark.playerId)) {
      throw new DomainError('FORBIDDEN', 'That player is not on this session.')
    }
  }
  await store.setExpected(coachId, sessionId, marks)
}

/**
 * Per-session participants pay for the sessions they attend: once they are
 * marked present, create their charge (at their agreed price) if there isn't
 * one. Idempotent, so re-saving attendance never double-charges.
 */
export async function chargeAttendedParticipants(
  store: DataStore,
  coachId: string,
  sessionId: string,
): Promise<number> {
  const session = await store.getSession(coachId, sessionId)
  if (!session?.programId || session.status !== 'scheduled') return 0

  const [program, roster, enrollments, charges] = await Promise.all([
    store.getProgram(coachId, session.programId),
    store.listProgramEnrollments(coachId),
    store.listEnrollmentsForSession(coachId, sessionId),
    store.listCharges(coachId),
  ])
  if (!program) return 0

  let created = 0
  for (const enrollment of enrollments) {
    if (enrollment.attendance !== 'present') continue
    const place = roster.find(
      (r) =>
        r.programId === program.id &&
        r.playerId === enrollment.playerId &&
        r.status === 'active' &&
        r.agreedBasis === 'per_session',
    )
    if (!place || place.agreedAmountCents <= 0) continue
    const already = charges.some(
      (c) => c.sessionId === sessionId && c.playerId === place.playerId,
    )
    if (already) continue

    await store.createCharge(coachId, {
      playerId: place.playerId,
      sessionId,
      amountCents: place.agreedAmountCents,
      priceSource: place.agreementSource === 'program_option' ? 'program_option' : 'custom',
      priceBasis: place.agreedBasis,
      standardAmountCents: place.standardAmountCents,
      programId: program.id,
      programEnrollmentId: place.id,
      dueDate: session.date,
      isManual: false,
      label: `${program.name} — ${place.agreedLabel}`,
      note: '',
    })
    created++
  }
  return created
}
