/**
 * In-memory DataStore adapter.
 *
 * Purpose: let the application run, be clicked through and be tested without
 * any Supabase credentials configured. It is selected automatically when
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are absent.
 *
 * It is NOT a production store: state lives in the Node process and is lost on
 * restart. It exists so that a fresh clone runs, and so the domain/service
 * layer has a fast, deterministic backend to test against.
 */

import { DEFAULT_TIME_ZONE } from '@/lib/domain/dates'
import type {
  Academy,
  AttendanceStatus,
  AvailabilityWindow,
  Charge,
  Coach,
  Credit,
  Enrollment,
  Invite,
  InvitePreview,
  ISODate,
  Membership,
  Payment,
  Player,
  Program,
  ProgramEnrollment,
  ProgramPriceOption,
  Session,
} from '@/lib/domain/types'
import type {
  DataStore,
  EnrollInProgramInput,
  NewChargeInput,
  NewCreditInput,
  NewPaymentInput,
  NewPlayerInput,
  NewPriceOptionInput,
  NewProgramInput,
  NewProgramOptionInput,
  NewSessionInput,
  UpdatePlayerInput,
  UpdatePriceOptionInput,
  UpdateProgramEnrollmentInput,
  UpdateProgramInput,
  UpdateSessionInput,
} from '../store'
import { buildSeed, type SeedProfile } from './seed'

interface Tables {
  coaches: Coach[]
  /** Maps Supabase auth user id -> coach id. */
  authLinks: Record<string, string>
  players: Player[]
  sessions: Session[]
  enrollments: Enrollment[]
  charges: Charge[]
  payments: Payment[]
  credits: Credit[]
  programs: Program[]
  priceOptions: ProgramPriceOption[]
  programEnrollments: ProgramEnrollment[]
  availability: AvailabilityWindow[]
  invites: Invite[]
  /** sessionId -> membership ids who worked it. */
  sessionCoaches: Record<string, string[]>
}

function emptyTables(): Tables {
  return {
    coaches: [],
    authLinks: {},
    players: [],
    sessions: [],
    enrollments: [],
    charges: [],
    payments: [],
    credits: [],
    programs: [],
    priceOptions: [],
    programEnrollments: [],
    availability: [],
    invites: [],
    sessionCoaches: {},
  }
}

let seq = 1000
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${seq.toString(36)}`
}

function nowISO(): string {
  return new Date().toISOString()
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class MockDataStore implements DataStore {
  private db: Tables

  constructor(db?: Tables) {
    this.db = db ?? emptyTables()
  }

  /** Load a seed profile into this store, replacing anything already there. */
  loadSeed(profile: SeedProfile = 'established', authId = 'demo-auth-user'): Coach {
    const seed = buildSeed(profile)
    this.db = emptyTables()
    this.db.coaches.push(seed.coach)
    this.db.authLinks[authId] = seed.coach.membershipId
    this.db.players.push(...seed.players)
    this.db.sessions.push(...seed.sessions)
    this.db.enrollments.push(...seed.enrollments)
    this.db.charges.push(...seed.charges)
    this.db.payments.push(...seed.payments)
    this.db.credits.push(...seed.credits)
    return seed.coach
  }

  // ---- coach ----
  // `coaches` holds one row per membership; `id` is the shared academy id and
  // `membershipId` is the row's own identity — see the `Coach` type's doc
  // comment. `authLinks` maps an auth user id to a *membership* id.

  async getCoach(membershipId: string): Promise<Coach | null> {
    return clone(this.db.coaches.find((c) => c.membershipId === membershipId) ?? null)
  }

  async getCoachByAuthId(authId: string): Promise<Coach | null> {
    const membershipId = this.db.authLinks[authId]
    if (!membershipId) return null
    return this.getCoach(membershipId)
  }

  async getAcademy(academyId: string): Promise<Academy | null> {
    const row = this.db.coaches.find((c) => c.id === academyId)
    if (!row) return null
    const { id, businessName, defaultRateCents, attendanceWindow, theme, timezone } = row
    return clone({ id, businessName, defaultRateCents, attendanceWindow, theme, timezone })
  }

  /**
   * Bootstraps an owner with a fresh academy — unless an open invitation for
   * this address exists, in which case they join the inviter's academy as a
   * coach (mirroring the database's signup trigger).
   */
  async createCoach(authId: string, input: { name: string; email: string }): Promise<Coach> {
    const email = input.email.trim().toLowerCase()
    const invite = this.db.invites.find(
      (i) =>
        i.email === email &&
        !i.acceptedAt &&
        !i.revokedAt &&
        new Date(i.expiresAt).getTime() > Date.now(),
    )
    if (invite) {
      const base = this.db.coaches.find((c) => c.id === invite.coachId)
      if (base) {
        const joined: Coach = {
          ...base,
          membershipId: nextId('member'),
          role: 'coach',
          name: input.name,
          email: input.email,
          onboardedAt: null,
        }
        this.db.coaches.push(joined)
        this.db.authLinks[authId] = joined.membershipId
        invite.acceptedAt = nowISO()
        return clone(joined)
      }
    }
    const coach: Coach = {
      id: nextId('academy'),
      membershipId: nextId('member'),
      role: 'owner',
      name: input.name,
      email: input.email,
      businessName: '',
      defaultRateCents: 7000,
      attendanceWindow: '24 hours',
      theme: 'Light',
      timezone: DEFAULT_TIME_ZONE,
      onboardedAt: null,
    }
    this.db.coaches.push(coach)
    this.db.authLinks[authId] = coach.membershipId
    return clone(coach)
  }

  /**
   * Test/demo support, deliberately not on the `DataStore` port: adds a
   * coach-role teammate to an existing academy. Real teammates arrive through
   * the invite flow.
   */
  addMember(
    academyId: string,
    authId: string,
    input: { name: string; email: string },
  ): Coach {
    const owner = this.db.coaches.find((c) => c.id === academyId)
    if (!owner) throw new Error('Academy not found')
    const member: Coach = {
      ...owner,
      membershipId: nextId('member'),
      role: 'coach',
      name: input.name,
      email: input.email,
      onboardedAt: null,
    }
    this.db.coaches.push(member)
    this.db.authLinks[authId] = member.membershipId
    return clone(member)
  }

  async updateMembershipProfile(
    membershipId: string,
    patch: Partial<{ name: string; email: string; onboardedAt: string | null }>,
  ): Promise<Coach> {
    const coach = this.db.coaches.find((c) => c.membershipId === membershipId)
    if (!coach) throw new Error('Coach not found')
    Object.assign(coach, patch)
    return clone(coach)
  }

  async updateAcademySettings(
    academyId: string,
    patch: Partial<{
      businessName: string
      defaultRateCents: number
      attendanceWindow: Coach['attendanceWindow']
      theme: Coach['theme']
      timezone: string
    }>,
  ): Promise<Academy> {
    const members = this.db.coaches.filter((c) => c.id === academyId)
    if (members.length === 0) throw new Error('Academy not found')
    members.forEach((c) => Object.assign(c, patch))
    const { id, businessName, defaultRateCents, attendanceWindow, theme, timezone } = members[0]
    return clone({ id, businessName, defaultRateCents, attendanceWindow, theme, timezone })
  }

  // ---- players ----

  async listPlayers(coachId: string, opts?: { includeDeleted?: boolean }): Promise<Player[]> {
    return clone(
      this.db.players.filter(
        (p) => p.coachId === coachId && (opts?.includeDeleted ? true : p.deletedAt === null),
      ),
    )
  }

  async getPlayer(coachId: string, playerId: string): Promise<Player | null> {
    return clone(
      this.db.players.find((p) => p.id === playerId && p.coachId === coachId) ?? null,
    )
  }

  async createPlayer(coachId: string, input: NewPlayerInput): Promise<Player> {
    const player: Player = {
      id: nextId('p'),
      coachId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      level: input.level,
      defaultRateCents: input.defaultRateCents,
      notes: input.notes,
      archived: false,
      deletedAt: null,
      createdAt: nowISO(),
    }
    this.db.players.push(player)
    return clone(player)
  }

  async updatePlayer(
    coachId: string,
    playerId: string,
    patch: UpdatePlayerInput,
  ): Promise<Player> {
    const player = this.db.players.find((p) => p.id === playerId && p.coachId === coachId)
    if (!player) throw new Error('Player not found')
    Object.assign(player, patch)
    return clone(player)
  }

  // ---- sessions ----

  async listSessions(coachId: string): Promise<Session[]> {
    return clone(this.db.sessions.filter((s) => s.coachId === coachId))
  }

  async getSession(coachId: string, sessionId: string): Promise<Session | null> {
    return clone(
      this.db.sessions.find((s) => s.id === sessionId && s.coachId === coachId) ?? null,
    )
  }

  async createSession(coachId: string, input: NewSessionInput): Promise<Session> {
    const session: Session = {
      id: nextId('s'),
      coachId,
      type: input.type,
      name: input.name,
      date: input.date,
      startMin: input.startMin,
      durationMin: input.durationMin,
      priceCents: input.priceCents,
      isFree: input.isFree,
      location: input.location,
      capacity: input.capacity,
      status: 'scheduled',
      programId: input.programId ?? null,
      coachMembershipId: input.coachMembershipId ?? null,
      attendanceSkipped: false,
      cancelledAt: null,
      createdAt: nowISO(),
    }
    this.db.sessions.push(session)
    return clone(session)
  }

  async updateSession(
    coachId: string,
    sessionId: string,
    patch: UpdateSessionInput,
  ): Promise<Session> {
    const session = this.db.sessions.find((s) => s.id === sessionId && s.coachId === coachId)
    if (!session) throw new Error('Session not found')
    Object.assign(session, patch)
    return clone(session)
  }

  // ---- enrollments ----

  async listEnrollments(coachId: string): Promise<Enrollment[]> {
    return clone(this.db.enrollments.filter((e) => e.coachId === coachId))
  }

  async listEnrollmentsForSession(coachId: string, sessionId: string): Promise<Enrollment[]> {
    return clone(
      this.db.enrollments.filter((e) => e.coachId === coachId && e.sessionId === sessionId),
    )
  }

  async addEnrollment(
    coachId: string,
    sessionId: string,
    playerId: string,
    opts?: { expected?: boolean },
  ): Promise<Enrollment> {
    const existing = this.db.enrollments.find(
      (e) => e.coachId === coachId && e.sessionId === sessionId && e.playerId === playerId,
    )
    if (existing) return clone(existing)
    const enrollment: Enrollment = {
      id: nextId('e'),
      coachId,
      sessionId,
      playerId,
      attendance: 'unmarked',
      expected: opts?.expected ?? true,
      createdAt: nowISO(),
    }
    this.db.enrollments.push(enrollment)
    return clone(enrollment)
  }

  async addEnrollments(
    coachId: string,
    sessionId: string,
    playerIds: string[],
    opts?: { expected?: boolean },
  ): Promise<void> {
    for (const playerId of playerIds) await this.addEnrollment(coachId, sessionId, playerId, opts)
  }

  async setExpected(
    coachId: string,
    sessionId: string,
    marks: Array<{ playerId: string; expected: boolean }>,
  ): Promise<void> {
    for (const mark of marks) {
      const enrollment = this.db.enrollments.find(
        (e) =>
          e.coachId === coachId && e.sessionId === sessionId && e.playerId === mark.playerId,
      )
      if (enrollment) enrollment.expected = mark.expected
    }
  }

  async removeEnrollment(
    coachId: string,
    sessionId: string,
    playerId: string,
  ): Promise<void> {
    this.db.enrollments = this.db.enrollments.filter(
      (e) =>
        !(e.coachId === coachId && e.sessionId === sessionId && e.playerId === playerId),
    )
  }

  async setAttendance(
    coachId: string,
    sessionId: string,
    marks: Array<{ playerId: string; attendance: AttendanceStatus }>,
  ): Promise<void> {
    for (const mark of marks) {
      const enrollment = this.db.enrollments.find(
        (e) =>
          e.coachId === coachId &&
          e.sessionId === sessionId &&
          e.playerId === mark.playerId,
      )
      if (enrollment) enrollment.attendance = mark.attendance
    }
  }

  // ---- financial ----

  async listCharges(coachId: string): Promise<Charge[]> {
    return clone(this.db.charges.filter((c) => c.coachId === coachId))
  }

  async listPayments(coachId: string): Promise<Payment[]> {
    return clone(this.db.payments.filter((p) => p.coachId === coachId))
  }

  async listCredits(coachId: string): Promise<Credit[]> {
    return clone(this.db.credits.filter((c) => c.coachId === coachId))
  }

  async getCharge(coachId: string, chargeId: string): Promise<Charge | null> {
    return clone(
      this.db.charges.find((c) => c.id === chargeId && c.coachId === coachId) ?? null,
    )
  }

  // ---- team ----

  async listMemberships(coachId: string): Promise<Membership[]> {
    const authByMembership = Object.fromEntries(
      Object.entries(this.db.authLinks).map(([auth, member]) => [member, auth]),
    )
    return this.db.coaches
      .filter((c) => c.id === coachId)
      .map((c) => ({
        id: c.membershipId,
        academyId: c.id,
        authUserId: authByMembership[c.membershipId] ?? '',
        role: c.role,
        name: c.name,
        email: c.email,
        onboardedAt: c.onboardedAt,
      }))
  }

  async removeMembership(coachId: string, membershipId: string): Promise<void> {
    const target = this.db.coaches.find(
      (c) => c.membershipId === membershipId && c.id === coachId,
    )
    if (!target) throw new Error('Member not found')
    if (target.role === 'owner') throw new Error('An academy’s owner cannot be removed')
    this.db.coaches = this.db.coaches.filter((c) => c.membershipId !== membershipId)
    for (const [auth, member] of Object.entries(this.db.authLinks)) {
      if (member === membershipId) delete this.db.authLinks[auth]
    }
    this.db.availability = this.db.availability.filter((w) => w.membershipId !== membershipId)
    for (const session of this.db.sessions) {
      if (session.coachMembershipId === membershipId) session.coachMembershipId = null
    }
    for (const [sessionId, ids] of Object.entries(this.db.sessionCoaches)) {
      this.db.sessionCoaches[sessionId] = ids.filter((id) => id !== membershipId)
    }
  }

  async listInvites(coachId: string): Promise<Invite[]> {
    return clone(this.db.invites.filter((i) => i.coachId === coachId))
  }

  async createInvite(
    coachId: string,
    input: { email: string; invitedBy: string },
  ): Promise<Invite> {
    const email = input.email.trim().toLowerCase()
    const open = this.db.invites.find(
      (i) => i.coachId === coachId && i.email === email && !i.acceptedAt && !i.revokedAt,
    )
    if (open) throw new Error('An invitation for that address is already open')
    const invite: Invite = {
      id: nextId('inv'),
      coachId,
      email,
      token: `tok${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      acceptedAt: null,
      revokedAt: null,
      createdAt: nowISO(),
    }
    this.db.invites.push(invite)
    return clone(invite)
  }

  async revokeInvite(coachId: string, inviteId: string): Promise<void> {
    const invite = this.db.invites.find((i) => i.id === inviteId && i.coachId === coachId)
    if (!invite) throw new Error('Invitation not found')
    invite.revokedAt = nowISO()
  }

  async getInvitePreview(token: string): Promise<InvitePreview | null> {
    const invite = this.db.invites.find((i) => i.token === token)
    if (!invite) return null
    const academy = this.db.coaches.find((c) => c.id === invite.coachId)
    return {
      businessName: academy?.businessName ?? '',
      email: invite.email,
      state: invite.acceptedAt
        ? 'accepted'
        : invite.revokedAt
          ? 'revoked'
          : new Date(invite.expiresAt).getTime() < Date.now()
            ? 'expired'
            : 'open',
    }
  }

  async listSessionCoaches(coachId: string, sessionId: string): Promise<string[]> {
    const session = this.db.sessions.find((s) => s.id === sessionId && s.coachId === coachId)
    return session ? [...(this.db.sessionCoaches[sessionId] ?? [])] : []
  }

  async setSessionCoaches(
    coachId: string,
    sessionId: string,
    membershipIds: string[],
  ): Promise<void> {
    const session = this.db.sessions.find((s) => s.id === sessionId && s.coachId === coachId)
    if (!session) throw new Error('Session not found')
    this.db.sessionCoaches[sessionId] = [...new Set(membershipIds)]
  }

  // ---- availability ----

  async listAvailability(coachId: string): Promise<AvailabilityWindow[]> {
    return clone(this.db.availability.filter((w) => w.coachId === coachId))
  }

  async replaceAvailability(
    coachId: string,
    membershipId: string,
    windows: Array<{ weekday: number; startMin: number; endMin: number }>,
  ): Promise<void> {
    this.db.availability = this.db.availability.filter(
      (w) => !(w.coachId === coachId && w.membershipId === membershipId),
    )
    for (const window of windows) {
      this.db.availability.push({
        id: nextId('av'),
        coachId,
        membershipId,
        ...window,
      })
    }
  }

  // ---- programs ----

  async listPrograms(coachId: string): Promise<Program[]> {
    return clone(this.db.programs.filter((p) => p.coachId === coachId))
  }

  async getProgram(coachId: string, programId: string): Promise<Program | null> {
    return clone(
      this.db.programs.find((p) => p.id === programId && p.coachId === coachId) ?? null,
    )
  }

  /**
   * Atomic, like the database function it stands in for: the program, its
   * options and its occurrences are all created, or (if any part is invalid)
   * none is. Validation mirrors the table constraints.
   */
  async createProgramWithOptions(
    coachId: string,
    input: NewProgramInput,
    options: NewProgramOptionInput[],
    occurrenceDates: ISODate[],
  ): Promise<Program> {
    return this.transaction(async () => {
      const bad = (what: string): never => {
        throw new Error(`violates check constraint: ${what}`)
      }
      if (!input.name.trim()) bad('name')
      if (input.weekdays.length === 0 || input.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        bad('weekdays')
      }
      if (input.startMin < 0 || input.startMin > 1439) bad('start_min')
      if (input.durationMin < 5 || input.durationMin > 480) bad('duration_min')
      if (input.capacity !== null && input.capacity < 2) bad('capacity')
      if (input.endsOn && input.endsOn < input.startsOn) bad('programs_dates_ordered')
      if (options.length === 0) bad('a program needs at least one price option')

      const program: Program = {
        id: nextId('prog'),
        coachId,
        ...input,
        weekdays: [...input.weekdays],
        status: 'active',
        createdAt: nowISO(),
      }
      this.db.programs.push(program)

      for (const [position, option] of options.entries()) {
        if (!option.label.trim()) bad('option label')
        if (!Number.isInteger(option.amountCents) || option.amountCents < 0) bad('amount_cents')
        this.db.priceOptions.push({
          id: nextId('opt'),
          coachId,
          programId: program.id,
          label: option.label,
          basis: option.basis,
          amountCents: option.amountCents,
          position,
          archivedAt: null,
        })
      }

      for (const date of occurrenceDates) {
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) bad('occurrence date')
        await this.createSession(coachId, {
          type: 'group',
          name: input.name,
          date,
          startMin: input.startMin,
          durationMin: input.durationMin,
          priceCents: 0,
          isFree: false,
          location: input.location,
          capacity: input.capacity,
          programId: program.id,
        })
      }
      return clone(program)
    })
  }

  async updateProgram(
    coachId: string,
    programId: string,
    patch: UpdateProgramInput,
  ): Promise<Program> {
    const program = this.db.programs.find((p) => p.id === programId && p.coachId === coachId)
    if (!program) throw new Error('Program not found')
    Object.assign(program, patch)
    return clone(program)
  }

  async listPriceOptions(coachId: string): Promise<ProgramPriceOption[]> {
    return clone(this.db.priceOptions.filter((o) => o.coachId === coachId))
  }

  async createPriceOption(
    coachId: string,
    input: NewPriceOptionInput,
  ): Promise<ProgramPriceOption> {
    const option: ProgramPriceOption = {
      id: nextId('opt'),
      coachId,
      ...input,
      archivedAt: null,
    }
    this.db.priceOptions.push(option)
    return clone(option)
  }

  async updatePriceOption(
    coachId: string,
    optionId: string,
    patch: UpdatePriceOptionInput,
  ): Promise<ProgramPriceOption> {
    const option = this.db.priceOptions.find((o) => o.id === optionId && o.coachId === coachId)
    if (!option) throw new Error('Price option not found')
    Object.assign(option, patch)
    return clone(option)
  }

  async listProgramEnrollments(coachId: string): Promise<ProgramEnrollment[]> {
    return clone(this.db.programEnrollments.filter((e) => e.coachId === coachId))
  }

  /**
   * Atomic, like the database function it stands in for: the roster place, the
   * occurrences and the first charge are all written, or none is. It enforces
   * the same rules as the database guards, in the same order, so a failure at
   * any step (including the last) discards everything.
   */
  async enrollInProgram(
    coachId: string,
    input: EnrollInProgramInput,
  ): Promise<{ enrollment: ProgramEnrollment; charge: Charge | null }> {
    return this.transaction(async () => {
      const { enrollment: e, sessionIds, charge } = input
      const program = this.db.programs.find((p) => p.id === e.programId && p.coachId === coachId)
      if (!program) throw new Error('Program belongs to a different academy')
      if (!this.db.players.some((p) => p.id === e.playerId && p.coachId === coachId)) {
        throw new Error('Player belongs to a different academy')
      }

      // guard_program_enrollment_insert: an agreement from an option must match it.
      if (e.agreementSource === 'program_option') {
        const option = this.db.priceOptions.find((o) => o.id === e.priceOptionId)
        if (!option || option.programId !== e.programId || option.archivedAt) {
          throw new Error('Choose one of the program’s current price options')
        }
        if (
          e.agreedAmountCents !== option.amountCents ||
          e.agreedBasis !== option.basis ||
          e.agreedLabel !== option.label ||
          e.standardAmountCents !== option.amountCents
        ) {
          throw new Error('The agreement must match the price option it was made from')
        }
      }

      // program_enrollments_one_active
      if (
        this.db.programEnrollments.some(
          (p) =>
            p.coachId === coachId &&
            p.programId === e.programId &&
            p.playerId === e.playerId &&
            p.status === 'active',
        )
      ) {
        throw new Error('duplicate key value violates unique constraint "program_enrollments_one_active"')
      }
      const place: ProgramEnrollment = {
        id: nextId('pe'),
        coachId,
        ...e,
        status: 'active',
        endedOn: null,
        createdAt: nowISO(),
      }
      this.db.programEnrollments.push(place)

      for (const sessionId of sessionIds) {
        const session = this.db.sessions.find((s) => s.id === sessionId && s.coachId === coachId)
        if (!session || session.programId !== e.programId) {
          throw new Error(`Session ${sessionId} is not part of this program`)
        }
        await this.addEnrollment(coachId, sessionId, e.playerId, { expected: true })
      }

      let created: Charge | null = null
      if (charge) {
        // guard_charge_insert: a program charge must equal the agreement.
        const source = place.agreementSource === 'program_option' ? 'program_option' : 'custom'
        if (
          charge.amountCents !== place.agreedAmountCents ||
          charge.priceBasis !== place.agreedBasis ||
          charge.standardAmountCents !== place.standardAmountCents ||
          charge.priceSource !== source
        ) {
          throw new Error('A program charge must equal the participant’s agreed price')
        }
        created = await this.createCharge(coachId, {
          ...charge,
          programId: program.id,
          programEnrollmentId: place.id,
        })
      }
      return { enrollment: clone(place), charge: created }
    })
  }

  async updateProgramEnrollment(
    coachId: string,
    enrollmentId: string,
    patch: UpdateProgramEnrollmentInput,
  ): Promise<ProgramEnrollment> {
    const enrollment = this.db.programEnrollments.find(
      (e) => e.id === enrollmentId && e.coachId === coachId,
    )
    if (!enrollment) throw new Error('Roster place not found')
    Object.assign(enrollment, patch)
    return clone(enrollment)
  }

  async createCharge(coachId: string, input: NewChargeInput): Promise<Charge> {
    const charge: Charge = {
      id: nextId('c'),
      coachId,
      playerId: input.playerId,
      sessionId: input.sessionId,
      amountCents: input.amountCents,
      priceSource: input.priceSource,
      priceBasis: input.priceBasis,
      standardAmountCents: input.standardAmountCents,
      programId: input.programId ?? null,
      programEnrollmentId: input.programEnrollmentId ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      dueDate: input.dueDate,
      isManual: input.isManual,
      label: input.label,
      note: input.note,
      voidedAt: null,
      voidNote: '',
      createdAt: nowISO(),
    }
    this.db.charges.push(charge)
    return clone(charge)
  }

  async createCharges(coachId: string, inputs: NewChargeInput[]): Promise<Charge[]> {
    const created: Charge[] = []
    for (const input of inputs) {
      created.push(await this.createCharge(coachId, input))
    }
    return created
  }

  async updateCharge(
    coachId: string,
    chargeId: string,
    patch: Partial<
      Pick<Charge, 'amountCents' | 'dueDate' | 'note' | 'label' | 'voidedAt' | 'voidNote'>
    >,
  ): Promise<Charge> {
    const charge = this.db.charges.find((c) => c.id === chargeId && c.coachId === coachId)
    if (!charge) throw new Error('Charge not found')
    Object.assign(charge, patch)
    return clone(charge)
  }

  async recordPayment(coachId: string, input: NewPaymentInput): Promise<Payment> {
    const charge = this.db.charges.find(
      (c) => c.id === input.chargeId && c.coachId === coachId,
    )
    if (!charge) throw new Error('Charge not found')
    const payment: Payment = {
      id: nextId('pay'),
      coachId,
      chargeId: input.chargeId,
      amountCents: input.amountCents,
      paidOn: input.paidOn,
      note: input.note,
      createdAt: nowISO(),
    }
    this.db.payments.push(payment)
    return clone(payment)
  }

  async recordCredit(coachId: string, input: NewCreditInput): Promise<Credit> {
    const charge = this.db.charges.find(
      (c) => c.id === input.chargeId && c.coachId === coachId,
    )
    if (!charge) throw new Error('Charge not found')
    const credit: Credit = {
      id: nextId('cr'),
      coachId,
      chargeId: input.chargeId,
      amountCents: input.amountCents,
      reason: input.reason,
      createdAt: nowISO(),
    }
    this.db.credits.push(credit)
    return clone(credit)
  }

  async clearPayments(coachId: string, chargeId: string): Promise<void> {
    this.db.payments = this.db.payments.filter(
      (p) => !(p.coachId === coachId && p.chargeId === chargeId),
    )
  }

  async listPaymentsForCharge(coachId: string, chargeId: string): Promise<Payment[]> {
    return clone(
      this.db.payments.filter((p) => p.coachId === coachId && p.chargeId === chargeId),
    )
  }

  async listCreditsForCharge(coachId: string, chargeId: string): Promise<Credit[]> {
    return clone(
      this.db.credits.filter((c) => c.coachId === coachId && c.chargeId === chargeId),
    )
  }

  /**
   * Snapshot / restore transaction. Good enough for a single-process in-memory
   * store: if the callback throws, every mutation it made is rolled back.
   */
  async transaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T> {
    const snapshot = clone(this.db)
    try {
      return await fn(this)
    } catch (error) {
      this.db = snapshot
      throw error
    }
  }
}

/**
 * Process-wide mock store. Kept on globalThis so Next.js dev-server hot reloads
 * don't reset the data on every edit.
 */
const globalRef = globalThis as unknown as { __coachosMockStore?: MockDataStore }

export function getMockStore(): MockDataStore {
  if (!globalRef.__coachosMockStore) {
    const store = new MockDataStore()
    store.loadSeed('established')
    globalRef.__coachosMockStore = store
  }
  return globalRef.__coachosMockStore
}

/** Fresh, isolated store for tests. */
export function createTestStore(profile: SeedProfile = 'established'): {
  store: MockDataStore
  coachId: string
} {
  const store = new MockDataStore()
  const coach = store.loadSeed(profile)
  return { store, coachId: coach.id }
}
