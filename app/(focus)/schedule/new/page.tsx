import { requireCoachPage } from '@/lib/auth'
import { centsToInput } from '@/lib/domain/money'
import { defaultPriceCents } from '@/lib/domain/sessions'
import { formatShort } from '@/lib/domain/dates'
import { defaultClock, listSelectablePlayers } from '@/lib/services/players'
import { buildDuplicateDraft } from '@/lib/services/sessions'
import { NewSessionForm } from './NewSessionForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New session — CoachOS' }

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: { type?: string; date?: string; player?: string; duplicate?: string }
}) {
  const { store, coachId, coach } = await requireCoachPage()
  const clock = defaultClock()

  const [players, sessions] = await Promise.all([
    listSelectablePlayers(store, coachId),
    store.listSessions(coachId),
  ])

  let draft = {
    type: (searchParams.type === 'group' ? 'group' : 'private') as 'private' | 'group',
    playerIds: searchParams.player ? [searchParams.player] : ([] as string[]),
    date: searchParams.date ?? clock.today,
    startMin: 840,
    durationMin: 60,
    price: '',
    isFree: false,
    location: '',
    capacity: 6,
    from: '',
  }

  // "Duplicate" prefills the shape of an existing session — never its
  // attendance, payments or charge history.
  if (searchParams.duplicate) {
    try {
      const source = await buildDuplicateDraft(
        store,
        coachId,
        searchParams.duplicate,
        clock,
      )
      const original = sessions.find((s) => s.id === searchParams.duplicate)
      draft = {
        type: source.type,
        playerIds: source.playerIds,
        date: source.date,
        startMin: source.startMin,
        durationMin: source.durationMin,
        price: source.isFree ? '' : centsToInput(source.priceCents),
        isFree: source.isFree,
        location: source.location,
        capacity: source.capacity,
        from: original ? `Duplicated from ${formatShort(original.date)}` : '',
      }
    } catch {
      // A bad or foreign id just falls through to an empty draft.
    }
  }

  // Auto price for a private lesson: the player's own rate, else coach default.
  if (!searchParams.duplicate && draft.type === 'private' && draft.playerIds[0]) {
    const player = players.find((p) => p.id === draft.playerIds[0])
    const cents = defaultPriceCents(
      'private',
      player?.defaultRateCents ?? null,
      coach.defaultRateCents,
    )
    draft.price = cents === null ? '' : centsToInput(cents)
  } else if (!searchParams.duplicate && draft.type === 'private') {
    draft.price = centsToInput(coach.defaultRateCents)
  }

  return (
    <NewSessionForm
      draft={draft}
      today={clock.today}
      coachDefaultRateCents={coach.defaultRateCents}
      players={players.map((p) => ({
        id: p.id,
        name: p.name,
        rateCents: p.defaultRateCents,
      }))}
      existing={sessions
        .filter((s) => s.status !== 'cancelled')
        .map((s) => ({
          id: s.id,
          name: s.name,
          date: s.date,
          startMin: s.startMin,
          endMin: s.startMin + s.durationMin,
        }))}
    />
  )
}
