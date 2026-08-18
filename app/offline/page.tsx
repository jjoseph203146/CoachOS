import { AppShell } from '@/components/shell/AppShell'

export const metadata = { title: 'Offline — CoachOS' }

/** Served by the service worker when a navigation fails with no network. */
export default function OfflinePage() {
  return (
    <AppShell>
      <div className="flex-1 flex flex-col justify-center text-center px-5">
        <div className="w-[52px] h-[52px] rounded-full bg-neutral_chip text-muted flex items-center justify-center text-t20 font-bold mx-auto">
          ⚡
        </div>
        <div className="text-t17 font-bold mt-4">You’re offline</div>
        <div className="text-t135 text-muted mt-[6px]">
          CoachOS needs a connection to load your sessions.
        </div>
      </div>
    </AppShell>
  )
}
