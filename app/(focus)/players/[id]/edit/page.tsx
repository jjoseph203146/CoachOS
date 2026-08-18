import { notFound } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { getPlayer } from '@/lib/services/players'
import { centsToInput } from '@/lib/domain/money'
import { isDomainError } from '@/lib/services/errors'
import { PlayerForm } from '@/components/players/PlayerForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit player — CoachOS' }

export default async function EditPlayerPage({ params }: { params: { id: string } }) {
  const { store, coachId, coach } = await requireCoachPage()

  try {
    const player = await getPlayer(store, coachId, params.id)
    return (
      <PlayerForm
        coachDefaultRateCents={coach.defaultRateCents}
        initial={{
          playerId: player.id,
          name: player.name,
          phone: player.phone,
          email: player.email,
          level: player.level,
          rate: centsToInput(player.defaultRateCents),
          notes: player.notes,
        }}
      />
    )
  } catch (error) {
    // A player id belonging to another coach resolves to NOT_FOUND, so an IDOR
    // attempt is indistinguishable from a genuine 404.
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }
}
