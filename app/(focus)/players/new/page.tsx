import { requireCoachPage } from '@/lib/auth'
import { PlayerForm } from '@/components/players/PlayerForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New player — CoachOS' }

export default async function NewPlayerPage() {
  const { coach } = await requireCoachPage()
  return (
    <PlayerForm
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
