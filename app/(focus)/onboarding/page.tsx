import { requireCoachPage } from '@/lib/auth'
import { centsToInput } from '@/lib/domain/money'
import { OnboardingFlow } from './OnboardingFlow'

export const metadata = { title: 'Welcome — CoachOS' }

export default async function OnboardingPage() {
  const { coach } = await requireCoachPage()
  return (
    <OnboardingFlow
      initialName={coach.name}
      initialBusiness={coach.businessName}
      initialRate={centsToInput(coach.defaultRateCents)}
    />
  )
}
