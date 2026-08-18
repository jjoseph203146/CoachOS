/**
 * Supabase / Postgres DataStore adapter.
 *
 * Row shapes are snake_case in the database and camelCase in the domain; the
 * mapping lives here and nowhere else.
 *
 * ── A note on transactions ────────────────────────────────────────────────
 * supabase-js speaks PostgREST, which has no client-side BEGIN/COMMIT. Two
 * things provide financial integrity instead:
 *
 *  1. Database-enforced invariants (see supabase/migrations). Triggers reject
 *     any payment or credit that would push a charge past its amount, and
 *     reject writes against voided charges. A duplicate "Mark Paid" therefore
 *     fails in the database even if it slips past the application.
 *  2. `transaction()` below records what it wrote and compensates (deletes the
 *     rows it inserted, restores the columns it changed) if the unit of work
 *     throws part-way through.
 *
 * Row-level security independently scopes every statement to the signed-in
 * coach, so authorization never depends on this file being called correctly.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AttendanceStatus,
  Charge,
  Coach,
  Credit,
  Enrollment,
  Payment,
  Player,
  Session,
} from '@/lib/domain/types'
import type {
  DataStore,
  NewChargeInput,
  NewCreditInput,
  NewPaymentInput,
  NewPlayerInput,
  NewSessionInput,
  UpdatePlayerInput,
  UpdateSessionInput,
} from '../store'

type Row = Record<string, any>

function mapCoach(row: Row): Coach {
  return {
    id: row.id,
    name: row.name ?? '',
    email: row.email ?? '',
    businessName: row.business_name ?? '',
    defaultRateCents: row.default_rate_cents ?? 0,
    attendanceWindow: row.attendance_window ?? '24 hours',
    theme: row.theme ?? 'Light',
    onboardedAt: row.onboarded_at ?? null,
  }
}

function mapPlayer(row: Row): Player {
  return {
    id: row.id,
    coachId: row.coach_id,
    name: row.name ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    level: row.level ?? 'Beginner',
    defaultRateCents: row.default_rate_cents ?? null,
    notes: row.notes ?? '',
    archived: !!row.archived,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
  }
}

function mapSession(row: Row): Session {
  return {
    id: row.id,
    coachId: row.coach_id,
    type: row.type,
    name: row.name ?? '',
    date: row.date,
    startMin: row.start_min,
    durationMin: row.duration_min,
    priceCents: row.price_cents ?? 0,
    isFree: !!row.is_free,
    location: row.location ?? '',
    capacity: row.capacity ?? null,
    status: row.status,
    attendanceSkipped: !!row.attendance_skipped,
    cancelledAt: row.cancelled_at ?? null,
    createdAt: row.created_at,
  }
}

function mapEnrollment(row: Row): Enrollment {
  return {
    id: row.id,
    coachId: row.coach_id,
    sessionId: row.session_id,
    playerId: row.player_id,
    attendance: row.attendance,
    createdAt: row.created_at,
  }
}

function mapCharge(row: Row): Charge {
  return {
    id: row.id,
    coachId: row.coach_id,
    playerId: row.player_id,
    sessionId: row.session_id ?? null,
    amountCents: row.amount_cents,
    dueDate: row.due_date,
    isManual: !!row.is_manual,
    label: row.label ?? '',
    note: row.note ?? '',
    voidedAt: row.voided_at ?? null,
    voidNote: row.void_note ?? '',
    createdAt: row.created_at,
  }
}

function mapPayment(row: Row): Payment {
  return {
    id: row.id,
    coachId: row.coach_id,
    chargeId: row.charge_id,
    amountCents: row.amount_cents,
    paidOn: row.paid_on,
    note: row.note ?? '',
    createdAt: row.created_at,
  }
}

function mapCredit(row: Row): Credit {
  return {
    id: row.id,
    coachId: row.coach_id,
    chargeId: row.charge_id,
    amountCents: row.amount_cents,
    reason: row.reason ?? '',
    createdAt: row.created_at,
  }
}

/** Undo entries recorded during a unit of work. */
type Compensation = () => Promise<void>

export class SupabaseDataStore implements DataStore {
  private client: SupabaseClient
  private undo: Compensation[] | null = null

  constructor(client: SupabaseClient) {
    this.client = client
  }

  /**
   * Untyped query builder. This project has no generated `Database` types, so
   * PostgREST's inference would collapse insert results to `never`. Every row
   * is mapped explicitly by the map* functions above, which is where the real
   * shape checking happens.
   */
  private from(table: string): any {
    return (this.client as any).from(table)
  }

  private track(fn: Compensation) {
    if (this.undo) this.undo.push(fn)
  }

  private async unwrap<T = Row>(promise: any): Promise<T> {
    const { data, error } = await promise
    if (error) throw new Error(error.message ?? 'Database error')
    if (data === null || data === undefined) {
      throw new Error('The database returned no row for a write that requires one')
    }
    return data as T
  }

  // ---- coach ----

  async getCoach(coachId: string): Promise<Coach | null> {
    const { data, error } = await this.client
      .from('coaches')
      .select('*')
      .eq('id', coachId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? mapCoach(data) : null
  }

  async getCoachByAuthId(authId: string): Promise<Coach | null> {
    const { data, error } = await this.client
      .from('coaches')
      .select('*')
      .eq('auth_user_id', authId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? mapCoach(data) : null
  }

  async createCoach(authId: string, input: { name: string; email: string }): Promise<Coach> {
    const row = await this.unwrap(
      this.client
        .from('coaches')
        .insert({ auth_user_id: authId, name: input.name, email: input.email })
        .select('*')
        .single(),
    )
    return mapCoach(row)
  }

  async updateCoach(coachId: string, patch: Partial<Omit<Coach, 'id'>>): Promise<Coach> {
    const payload: Row = {}
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.email !== undefined) payload.email = patch.email
    if (patch.businessName !== undefined) payload.business_name = patch.businessName
    if (patch.defaultRateCents !== undefined) {
      payload.default_rate_cents = patch.defaultRateCents
    }
    if (patch.attendanceWindow !== undefined) {
      payload.attendance_window = patch.attendanceWindow
    }
    if (patch.theme !== undefined) payload.theme = patch.theme
    if (patch.onboardedAt !== undefined) payload.onboarded_at = patch.onboardedAt

    const row = await this.unwrap(
      this.from('coaches').update(payload).eq('id', coachId).select('*').single(),
    )
    return mapCoach(row)
  }

  // ---- players ----

  async listPlayers(coachId: string, opts?: { includeDeleted?: boolean }): Promise<Player[]> {
    let query = this.from('players').select('*').eq('coach_id', coachId)
    if (!opts?.includeDeleted) query = query.is('deleted_at', null)
    const rows = await this.unwrap<Row[]>(query.order('name'))
    return (rows ?? []).map(mapPlayer)
  }

  async getPlayer(coachId: string, playerId: string): Promise<Player | null> {
    const { data, error } = await this.client
      .from('players')
      .select('*')
      .eq('coach_id', coachId)
      .eq('id', playerId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? mapPlayer(data) : null
  }

  async createPlayer(coachId: string, input: NewPlayerInput): Promise<Player> {
    const row = await this.unwrap(
      this.client
        .from('players')
        .insert({
          coach_id: coachId,
          name: input.name,
          phone: input.phone,
          email: input.email,
          level: input.level,
          default_rate_cents: input.defaultRateCents,
          notes: input.notes,
        })
        .select('*')
        .single(),
    )
    this.track(async () => {
      await this.from('players').delete().eq('id', row.id)
    })
    return mapPlayer(row)
  }

  async updatePlayer(
    coachId: string,
    playerId: string,
    patch: UpdatePlayerInput,
  ): Promise<Player> {
    const before = await this.getPlayer(coachId, playerId)
    const payload: Row = {}
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.phone !== undefined) payload.phone = patch.phone
    if (patch.email !== undefined) payload.email = patch.email
    if (patch.level !== undefined) payload.level = patch.level
    if (patch.defaultRateCents !== undefined) {
      payload.default_rate_cents = patch.defaultRateCents
    }
    if (patch.notes !== undefined) payload.notes = patch.notes
    if (patch.archived !== undefined) payload.archived = patch.archived
    if (patch.deletedAt !== undefined) payload.deleted_at = patch.deletedAt

    const row = await this.unwrap(
      this.client
        .from('players')
        .update(payload)
        .eq('coach_id', coachId)
        .eq('id', playerId)
        .select('*')
        .single(),
    )
    if (before) {
      this.track(async () => {
        await this.client
          .from('players')
          .update({
            name: before.name,
            phone: before.phone,
            email: before.email,
            level: before.level,
            default_rate_cents: before.defaultRateCents,
            notes: before.notes,
            archived: before.archived,
            deleted_at: before.deletedAt,
          })
          .eq('id', playerId)
      })
    }
    return mapPlayer(row)
  }

  // ---- sessions ----

  async listSessions(coachId: string): Promise<Session[]> {
    const rows = await this.unwrap<Row[]>(
      this.client
        .from('sessions')
        .select('*')
        .eq('coach_id', coachId)
        .order('date')
        .order('start_min'),
    )
    return (rows ?? []).map(mapSession)
  }

  async getSession(coachId: string, sessionId: string): Promise<Session | null> {
    const { data, error } = await this.client
      .from('sessions')
      .select('*')
      .eq('coach_id', coachId)
      .eq('id', sessionId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? mapSession(data) : null
  }

  async createSession(coachId: string, input: NewSessionInput): Promise<Session> {
    const row = await this.unwrap(
      this.client
        .from('sessions')
        .insert({
          coach_id: coachId,
          type: input.type,
          name: input.name,
          date: input.date,
          start_min: input.startMin,
          duration_min: input.durationMin,
          price_cents: input.priceCents,
          is_free: input.isFree,
          location: input.location,
          capacity: input.capacity,
        })
        .select('*')
        .single(),
    )
    this.track(async () => {
      await this.from('sessions').delete().eq('id', row.id)
    })
    return mapSession(row)
  }

  async updateSession(
    coachId: string,
    sessionId: string,
    patch: UpdateSessionInput,
  ): Promise<Session> {
    const before = await this.getSession(coachId, sessionId)
    const payload: Row = {}
    if (patch.type !== undefined) payload.type = patch.type
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.date !== undefined) payload.date = patch.date
    if (patch.startMin !== undefined) payload.start_min = patch.startMin
    if (patch.durationMin !== undefined) payload.duration_min = patch.durationMin
    if (patch.priceCents !== undefined) payload.price_cents = patch.priceCents
    if (patch.isFree !== undefined) payload.is_free = patch.isFree
    if (patch.location !== undefined) payload.location = patch.location
    if (patch.capacity !== undefined) payload.capacity = patch.capacity
    if (patch.status !== undefined) payload.status = patch.status
    if (patch.attendanceSkipped !== undefined) {
      payload.attendance_skipped = patch.attendanceSkipped
    }
    if (patch.cancelledAt !== undefined) payload.cancelled_at = patch.cancelledAt

    const row = await this.unwrap(
      this.client
        .from('sessions')
        .update(payload)
        .eq('coach_id', coachId)
        .eq('id', sessionId)
        .select('*')
        .single(),
    )
    if (before) {
      this.track(async () => {
        await this.client
          .from('sessions')
          .update({
            name: before.name,
            date: before.date,
            start_min: before.startMin,
            duration_min: before.durationMin,
            price_cents: before.priceCents,
            is_free: before.isFree,
            location: before.location,
            capacity: before.capacity,
            status: before.status,
            attendance_skipped: before.attendanceSkipped,
            cancelled_at: before.cancelledAt,
          })
          .eq('id', sessionId)
      })
    }
    return mapSession(row)
  }

  // ---- enrollments ----

  async listEnrollments(coachId: string): Promise<Enrollment[]> {
    const rows = await this.unwrap<Row[]>(
      this.from('enrollments').select('*').eq('coach_id', coachId),
    )
    return (rows ?? []).map(mapEnrollment)
  }

  async listEnrollmentsForSession(
    coachId: string,
    sessionId: string,
  ): Promise<Enrollment[]> {
    const rows = await this.unwrap<Row[]>(
      this.client
        .from('enrollments')
        .select('*')
        .eq('coach_id', coachId)
        .eq('session_id', sessionId)
        .order('created_at'),
    )
    return (rows ?? []).map(mapEnrollment)
  }

  async addEnrollment(
    coachId: string,
    sessionId: string,
    playerId: string,
  ): Promise<Enrollment> {
    const row = await this.unwrap(
      this.client
        .from('enrollments')
        .upsert(
          { coach_id: coachId, session_id: sessionId, player_id: playerId },
          { onConflict: 'session_id,player_id' },
        )
        .select('*')
        .single(),
    )
    this.track(async () => {
      await this.from('enrollments').delete().eq('id', row.id)
    })
    return mapEnrollment(row)
  }

  async removeEnrollment(
    coachId: string,
    sessionId: string,
    playerId: string,
  ): Promise<void> {
    const { data } = await this.client
      .from('enrollments')
      .select('*')
      .eq('coach_id', coachId)
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
      .maybeSingle()

    const { error } = await this.client
      .from('enrollments')
      .delete()
      .eq('coach_id', coachId)
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
    if (error) throw new Error(error.message)

    if (data) {
      this.track(async () => {
        await this.from('enrollments').insert({
          id: data.id,
          coach_id: data.coach_id,
          session_id: data.session_id,
          player_id: data.player_id,
          attendance: data.attendance,
        })
      })
    }
  }

  async setAttendance(
    coachId: string,
    sessionId: string,
    marks: Array<{ playerId: string; attendance: AttendanceStatus }>,
  ): Promise<void> {
    for (const mark of marks) {
      const { error } = await this.client
        .from('enrollments')
        .update({ attendance: mark.attendance })
        .eq('coach_id', coachId)
        .eq('session_id', sessionId)
        .eq('player_id', mark.playerId)
      if (error) throw new Error(error.message)
    }
  }

  // ---- financial ----

  async listCharges(coachId: string): Promise<Charge[]> {
    const rows = await this.unwrap<Row[]>(
      this.from('charges').select('*').eq('coach_id', coachId),
    )
    return (rows ?? []).map(mapCharge)
  }

  async listPayments(coachId: string): Promise<Payment[]> {
    const rows = await this.unwrap<Row[]>(
      this.from('payments').select('*').eq('coach_id', coachId),
    )
    return (rows ?? []).map(mapPayment)
  }

  async listCredits(coachId: string): Promise<Credit[]> {
    const rows = await this.unwrap<Row[]>(
      this.from('credits').select('*').eq('coach_id', coachId),
    )
    return (rows ?? []).map(mapCredit)
  }

  async getCharge(coachId: string, chargeId: string): Promise<Charge | null> {
    const { data, error } = await this.client
      .from('charges')
      .select('*')
      .eq('coach_id', coachId)
      .eq('id', chargeId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? mapCharge(data) : null
  }

  async createCharge(coachId: string, input: NewChargeInput): Promise<Charge> {
    const [charge] = await this.createCharges(coachId, [input])
    return charge
  }

  async createCharges(coachId: string, inputs: NewChargeInput[]): Promise<Charge[]> {
    if (inputs.length === 0) return []
    const rows = await this.unwrap<Row[]>(
      this.client
        .from('charges')
        .insert(
          inputs.map((input) => ({
            coach_id: coachId,
            player_id: input.playerId,
            session_id: input.sessionId,
            amount_cents: input.amountCents,
            due_date: input.dueDate,
            is_manual: input.isManual,
            label: input.label,
            note: input.note,
          })),
        )
        .select('*'),
    )
    const list = (rows ?? []) as Row[]
    this.track(async () => {
      await this.client
        .from('charges')
        .delete()
        .in('id', list.map((r) => r.id))
    })
    return list.map(mapCharge)
  }

  async updateCharge(
    coachId: string,
    chargeId: string,
    patch: Partial<
      Pick<Charge, 'amountCents' | 'dueDate' | 'note' | 'label' | 'voidedAt' | 'voidNote'>
    >,
  ): Promise<Charge> {
    const before = await this.getCharge(coachId, chargeId)
    const payload: Row = {}
    if (patch.amountCents !== undefined) payload.amount_cents = patch.amountCents
    if (patch.dueDate !== undefined) payload.due_date = patch.dueDate
    if (patch.note !== undefined) payload.note = patch.note
    if (patch.label !== undefined) payload.label = patch.label
    if (patch.voidedAt !== undefined) payload.voided_at = patch.voidedAt
    if (patch.voidNote !== undefined) payload.void_note = patch.voidNote

    const row = await this.unwrap(
      this.client
        .from('charges')
        .update(payload)
        .eq('coach_id', coachId)
        .eq('id', chargeId)
        .select('*')
        .single(),
    )
    if (before) {
      this.track(async () => {
        await this.client
          .from('charges')
          .update({
            amount_cents: before.amountCents,
            due_date: before.dueDate,
            note: before.note,
            label: before.label,
            voided_at: before.voidedAt,
            void_note: before.voidNote,
          })
          .eq('id', chargeId)
      })
    }
    return mapCharge(row)
  }

  async recordPayment(coachId: string, input: NewPaymentInput): Promise<Payment> {
    const row = await this.unwrap(
      this.client
        .from('payments')
        .insert({
          coach_id: coachId,
          charge_id: input.chargeId,
          amount_cents: input.amountCents,
          paid_on: input.paidOn,
          note: input.note,
        })
        .select('*')
        .single(),
    )
    this.track(async () => {
      await this.from('payments').delete().eq('id', row.id)
    })
    return mapPayment(row)
  }

  async recordCredit(coachId: string, input: NewCreditInput): Promise<Credit> {
    const row = await this.unwrap(
      this.client
        .from('credits')
        .insert({
          coach_id: coachId,
          charge_id: input.chargeId,
          amount_cents: input.amountCents,
          reason: input.reason,
        })
        .select('*')
        .single(),
    )
    this.track(async () => {
      await this.from('credits').delete().eq('id', row.id)
    })
    return mapCredit(row)
  }

  async clearPayments(coachId: string, chargeId: string): Promise<void> {
    const { data } = await this.client
      .from('payments')
      .select('*')
      .eq('coach_id', coachId)
      .eq('charge_id', chargeId)

    const { error } = await this.client
      .from('payments')
      .delete()
      .eq('coach_id', coachId)
      .eq('charge_id', chargeId)
    if (error) throw new Error(error.message)

    const removed = (data ?? []) as Row[]
    if (removed.length > 0) {
      this.track(async () => {
        await this.from('payments').insert(
          removed.map((r) => ({
            id: r.id,
            coach_id: r.coach_id,
            charge_id: r.charge_id,
            amount_cents: r.amount_cents,
            paid_on: r.paid_on,
            note: r.note,
          })),
        )
      })
    }
  }

  async listPaymentsForCharge(coachId: string, chargeId: string): Promise<Payment[]> {
    const rows = await this.unwrap<Row[]>(
      this.client
        .from('payments')
        .select('*')
        .eq('coach_id', coachId)
        .eq('charge_id', chargeId),
    )
    return (rows ?? []).map(mapPayment)
  }

  async listCreditsForCharge(coachId: string, chargeId: string): Promise<Credit[]> {
    const rows = await this.unwrap<Row[]>(
      this.client
        .from('credits')
        .select('*')
        .eq('coach_id', coachId)
        .eq('charge_id', chargeId),
    )
    return (rows ?? []).map(mapCredit)
  }

  /**
   * Unit of work with compensating rollback. Nested calls join the outer unit
   * so an inner failure still unwinds everything.
   */
  async transaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T> {
    if (this.undo) return fn(this)
    this.undo = []
    try {
      const result = await fn(this)
      this.undo = null
      return result
    } catch (error) {
      const compensations = this.undo ?? []
      this.undo = null
      // Unwind newest-first so foreign keys stay satisfied.
      for (const compensate of compensations.reverse()) {
        try {
          await compensate()
        } catch {
          // Best effort: the database invariants below are the real guarantee.
        }
      }
      throw error
    }
  }
}
