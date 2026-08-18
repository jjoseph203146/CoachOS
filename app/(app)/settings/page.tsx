import { requireCoachPage } from '@/lib/auth'
import { supportedTimeZones } from '@/lib/domain/dates'
import { centsToInput } from '@/lib/domain/money'
import { SettingsView } from './SettingsView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings — CoachOS' }

export default async function SettingsPage() {
  const { coach } = await requireCoachPage()
  return (
    <SettingsView
      initial={{
        name: coach.name,
        email: coach.email,
        businessName: coach.businessName,
        rate: centsToInput(coach.defaultRateCents),
        attendanceWindow: coach.attendanceWindow,
        theme: coach.theme,
        timezone: coach.timezone,
      }}
      timezones={supportedTimeZones()}
    />
  )
}
