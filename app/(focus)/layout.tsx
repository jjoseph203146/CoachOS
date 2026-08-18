import { requireCoachPage } from '@/lib/auth'
import { AppShell } from '@/components/shell/AppShell'

/**
 * Never prerender or cache an authenticated screen: these render one coach's
 * private data and must be produced per request.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Focused, full-screen flows (new session, attendance, player form, onboarding).
 * The prototype hides the tab bar on all of these.
 */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireCoachPage()
  return <AppShell>{children}</AppShell>
}
