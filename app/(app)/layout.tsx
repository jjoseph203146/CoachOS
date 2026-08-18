import { requireCoachPage } from '@/lib/auth'
import { AppShell } from '@/components/shell/AppShell'
import { TabBar } from '@/components/shell/TabBar'

/**
 * Never prerender or cache an authenticated screen: these render one
 * coach's private data and must be produced per request.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

/** Signed-in screens that show the bottom tab bar. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireCoachPage()
  return (
    <AppShell>
      {children}
      <TabBar />
    </AppShell>
  )
}
