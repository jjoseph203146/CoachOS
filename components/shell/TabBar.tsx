'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Sheet, SheetTitle } from '@/components/ui/overlays'

/**
 * Bottom tab bar with the centre "+" FAB, reproduced from the prototype:
 * translucent #FBFBF8 at 94% with a 14px blur, hairline top border, 23px
 * stroked icons, 10px labels, and a 52px green FAB lifted 26px above the bar.
 */

const ACTIVE = '#171918'
const INACTIVE = '#A8ACA5'

function HomeIcon({ color }: { color: string }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.9"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M4 10.5 12 4l8 6.5V20h-5.2v-4.8h-5.6V20H4Z" />
    </svg>
  )
}

function ScheduleIcon({ color }: { color: string }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.9"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path d="M3.5 10.5h17M8.5 3.5v3.5M15.5 3.5v3.5" />
    </svg>
  )
}

function PlayersIcon({ color }: { color: string }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.9"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <circle cx="12" cy="8.6" r="3.4" />
      <path d="M5.5 19.5c.8-3.6 3.3-5.4 6.5-5.4s5.7 1.8 6.5 5.4" />
    </svg>
  )
}

function PaymentsIcon({ color }: { color: string }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.9"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <rect x="3" y="6.5" width="18" height="12" rx="2.5" />
      <circle cx="12" cy="12.5" r="2.4" />
    </svg>
  )
}

const TABS = [
  { href: '/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/schedule', label: 'Schedule', Icon: ScheduleIcon },
  { href: '/players', label: 'Players', Icon: PlayersIcon },
  { href: '/payments', label: 'Payments', Icon: PaymentsIcon },
]

export function TabBar() {
  const pathname = usePathname()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const go = (type: 'private' | 'group') => {
    setCreateOpen(false)
    router.push(`/schedule/new?type=${type}`)
  }

  return (
    <>
      <nav
        className="absolute left-0 right-0 bottom-0 z-30 border-t border-line px-2 pt-[6px] pb-1"
        style={{ background: 'rgba(251,251,248,.94)', backdropFilter: 'blur(14px)' }}
      >
        <div className="flex items-center">
          {TABS.slice(0, 2).map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}

          <div className="flex-1 flex justify-center">
            <button
              onClick={() => setCreateOpen(true)}
              aria-label="New session"
              className="w-[52px] h-[52px] rounded-full bg-accent text-white flex items-center justify-center -mt-[26px] shadow-fab"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {TABS.slice(2).map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}
        </div>
        {/* Home indicator bar from the design. */}
        <div className="flex justify-center pt-[7px]">
          <div className="w-[134px] h-[5px] rounded-r3 bg-ink opacity-[.85]" />
        </div>
      </nav>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)}>
        <SheetTitle>New Session</SheetTitle>
        <button
          onClick={() => go('private')}
          className="w-full flex items-center gap-[13px] bg-card border border-line rounded-r14 px-4 py-[15px] mt-4"
        >
          <div className="w-10 h-10 rounded-r12 bg-accent_soft flex items-center justify-center shrink-0">
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2E7D4F"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <circle cx="12" cy="8.6" r="3.4" />
              <path d="M5.5 19.5c.8-3.6 3.3-5.4 6.5-5.4s5.7 1.8 6.5 5.4" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <div className="text-t15 font-bold">Private Lesson</div>
            <div className="text-t125 text-muted mt-[1px]">One player, one-on-one</div>
          </div>
          <span className="text-chevron text-t17">›</span>
        </button>
        <button
          onClick={() => go('group')}
          className="w-full flex items-center gap-[13px] bg-card border border-line rounded-r14 px-4 py-[15px] mt-[10px]"
        >
          <div className="w-10 h-10 rounded-r12 bg-neutral_chip flex items-center justify-center shrink-0">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#171918"
              strokeWidth="1.9"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <circle cx="9" cy="8.8" r="3" />
              <path d="M3.5 19c.7-3.1 2.8-4.7 5.5-4.7s4.8 1.6 5.5 4.7" />
              <circle cx="16.8" cy="9.6" r="2.5" />
              <path d="M16.2 14.5c2.3.3 3.8 1.7 4.3 4.5" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <div className="text-t15 font-bold">Group Session</div>
            <div className="text-t125 text-muted mt-[1px]">
              Multiple players, per-player price
            </div>
          </div>
          <span className="text-chevron text-t17">›</span>
        </button>
      </Sheet>
    </>
  )
}

function TabLink({
  tab,
  active,
}: {
  tab: (typeof TABS)[number]
  active: boolean
}) {
  const color = active ? ACTIVE : INACTIVE
  return (
    <Link
      href={tab.href}
      className="flex-1 flex flex-col items-center gap-[3px] py-[5px]"
      aria-current={active ? 'page' : undefined}
    >
      <tab.Icon color={color} />
      <span className="text-t10 font-semibold" style={{ color }}>
        {tab.label}
      </span>
    </Link>
  )
}
