'use server'

import { revalidatePath } from 'next/cache'
import { requireCoachAction } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import {
  addPriceOption,
  archivePriceOption,
  billPlace,
  createProgram,
  endPlace,
  endProgram,
  enrollParticipant,
  extendProgram,
  setExpected,
  updatePriceOption,
} from '@/lib/services/programs'
import {
  addPriceOptionSchema,
  archivePriceOptionSchema,
  createProgramSchema,
  enrollParticipantSchema,
  programIdSchema,
  rosterPlaceSchema,
  setExpectedSchema,
  updatePriceOptionSchema,
} from '@/lib/validation/schemas'
import { ok, runAction, type ActionResult } from './result'

function revalidateProgramViews(programId?: string) {
  revalidatePath('/programs')
  revalidatePath('/schedule')
  revalidatePath('/dashboard')
  revalidatePath('/payments')
  if (programId) revalidatePath(`/programs/${programId}`)
}

export async function createProgramAction(input: {
  name: string
  audience: string
  weekdays: number[]
  startMin: number
  durationMin: number
  location: string
  capacity: number | null
  ageRange: string
  startsOn: string
  endsOn: string | null
  options: Array<{ label: string; basis: string; amount: string }>
}): Promise<ActionResult<{ programId: string }>> {
  return runAction('createProgram', async () => {
    const { store, coachId, coach, role } = await requireCoachAction()
    const data = createProgramSchema.parse(input)
    const program = await createProgram(
      store,
      coachId,
      role,
      {
        name: data.name,
        audience: data.audience,
        weekdays: data.weekdays,
        startMin: data.startMin,
        durationMin: data.durationMin,
        location: data.location,
        capacity: data.capacity ?? null,
        ageRange: data.ageRange,
        startsOn: data.startsOn,
        endsOn: data.endsOn ?? null,
        options: data.options,
      },
      coachClock(coach).today,
    )
    revalidateProgramViews(program.id)
    return ok({ programId: program.id })
  })
}

export async function addPriceOptionAction(input: {
  programId: string
  option: { label: string; basis: string; amount: string }
}): Promise<ActionResult> {
  return runAction('addPriceOption', async () => {
    const { store, coachId, role } = await requireCoachAction()
    const data = addPriceOptionSchema.parse(input)
    await addPriceOption(store, coachId, role, data.programId, data.option)
    revalidateProgramViews(data.programId)
    return ok()
  })
}

export async function updatePriceOptionAction(input: {
  programId: string
  optionId: string
  label?: string
  amount?: string
}): Promise<ActionResult> {
  return runAction('updatePriceOption', async () => {
    const { store, coachId, role } = await requireCoachAction()
    const data = updatePriceOptionSchema.parse(input)
    await updatePriceOption(store, coachId, role, data.optionId, {
      label: data.label,
      amountCents: data.amountCents,
    })
    revalidateProgramViews(input.programId)
    return ok()
  })
}

export async function archivePriceOptionAction(input: {
  programId: string
  optionId: string
}): Promise<ActionResult> {
  return runAction('archivePriceOption', async () => {
    const { store, coachId, role } = await requireCoachAction()
    const data = archivePriceOptionSchema.parse(input)
    await archivePriceOption(store, coachId, role, data.optionId)
    revalidateProgramViews(input.programId)
    return ok()
  })
}

export async function enrollParticipantAction(input: {
  programId: string
  playerId: string
  priceOptionId: string | null
  customAmount?: string
  customLabel?: string
  customBasis?: string
  note: string
}): Promise<ActionResult> {
  return runAction('enrollParticipant', async () => {
    const { store, coachId, coach, role } = await requireCoachAction()
    const data = enrollParticipantSchema.parse(input)
    await enrollParticipant(store, coachId, role, data, coachClock(coach).today)
    revalidateProgramViews(data.programId)
    return ok()
  })
}

export async function endPlaceAction(input: {
  programId: string
  enrollmentId: string
}): Promise<ActionResult> {
  return runAction('endPlace', async () => {
    const { store, coachId, coach } = await requireCoachAction()
    const data = rosterPlaceSchema.parse(input)
    await endPlace(store, coachId, data.enrollmentId, coachClock(coach).today)
    revalidateProgramViews(input.programId)
    return ok()
  })
}

export async function billPlaceAction(input: {
  programId: string
  enrollmentId: string
}): Promise<ActionResult> {
  return runAction('billPlace', async () => {
    const { store, coachId, coach } = await requireCoachAction()
    const data = rosterPlaceSchema.parse(input)
    await billPlace(store, coachId, data.enrollmentId, coachClock(coach).today)
    revalidateProgramViews(input.programId)
    return ok()
  })
}

export async function extendProgramAction(input: {
  programId: string
}): Promise<ActionResult<{ created: number }>> {
  return runAction('extendProgram', async () => {
    const { store, coachId, coach } = await requireCoachAction()
    const data = programIdSchema.parse(input)
    const created = await extendProgram(store, coachId, data.programId, coachClock(coach).today)
    revalidateProgramViews(data.programId)
    return ok({ created })
  })
}

export async function endProgramAction(input: { programId: string }): Promise<ActionResult> {
  return runAction('endProgram', async () => {
    const { store, coachId, coach, role } = await requireCoachAction()
    const data = programIdSchema.parse(input)
    await endProgram(store, coachId, role, data.programId, coachClock(coach).today)
    revalidateProgramViews(data.programId)
    return ok()
  })
}

export async function setExpectedAction(input: {
  sessionId: string
  marks: Array<{ playerId: string; expected: boolean }>
}): Promise<ActionResult> {
  return runAction('setExpected', async () => {
    const { store, coachId } = await requireCoachAction()
    const data = setExpectedSchema.parse(input)
    await setExpected(store, coachId, data.sessionId, data.marks)
    revalidatePath(`/sessions/${data.sessionId}`)
    revalidatePath('/dashboard')
    revalidatePath('/programs')
    return ok()
  })
}
