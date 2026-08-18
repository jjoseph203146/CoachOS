import Link from 'next/link'
import { AppShell } from '@/components/shell/AppShell'

export default function NotFound() {
  return (
    <AppShell>
      <div className="flex-1 flex flex-col justify-center text-center px-5">
        <div className="text-t17 font-bold">Not found</div>
        <div className="text-t135 text-muted mt-[6px]">
          That page doesn’t exist.
        </div>
        <Link
          href="/dashboard"
          className="h-[46px] w-40 rounded-r12 bg-ink text-shell text-t14 font-semibold flex items-center justify-center mx-auto mt-5"
        >
          Go Home
        </Link>
      </div>
    </AppShell>
  )
}
