import { requireCoachPage } from '@/lib/auth'
import { PlayerForm } from '@/components/players/PlayerForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New player — CoachOS' }

export default async function NewPlayerPage() {
  const { coach, role } = await requireCoachPage()
  return (
    <PlayerForm
      canSetRate={role === 'owner'}
      coachDefaultRateCents={coach.defaultRateCents}
      initial={{
        name: '',
        phone: '',
        email: '',
        level: 'Beginner',
        rate: '',
        notes: '',
      }}
    />
  )
}
