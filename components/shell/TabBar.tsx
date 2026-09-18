'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sheet, SheetTitle } from '@/components/ui/overlays'
import type { MembershipRole } from '@/lib/domain/types'

/**
 * Bottom tab bar with the centre "+" FAB, from the V1 spec (preview.html):
 * Today / Calendar / [+] / People / More. Active tab and the FAB are the brand
 * blue on a translucent white bar with a hairline top border. The 56px FAB has
 * a 4px white ring and a blue glow.
 *
 * Money lives under More (owner only), not in the bar, so a coach never sees a
 * Revenue entry point here.
 */

const ACTIVE = '#1677EE'
const INACTIVE = '#718095'

function Icon({ color, children }: { color: string; children: ReactNode }) {
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
      {children}
    </svg>
  )
}

const TodayIcon = ({ color }: { color: string }) => (
  <Icon color={color}>
    <path d="M4 10.5 12 4l8 6.5V20h-5.2v-4.8h-5.6V20H4Z" />
  </Icon>
)

const CalendarIcon = ({ color }: { color: string }) => (
  <Icon color={color}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
    <path d="M3.5 10.5h17M8.5 3.5v3.5M15.5 3.5v3.5" />
  </Icon>
)

const PeopleIcon = ({ color }: { color: string }) => (
  <Icon color={color}>
    <circle cx="12" cy="8.6" r="3.4" />
    <path d="M5.5 19.5c.8-3.6 3.3-5.4 6.5-5.4s5.7 1.8 6.5 5.4" />
  </Icon>
)

const MoreIcon = ({ color }: { color: string }) => (
  <Icon color={color}>
    <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
  </Icon>
)

interface Tab {
  href: string
  label: string
  Icon: (props: { color: string }) => JSX.Element
  /** Extra path prefixes that keep this tab highlighted (screens it hosts). */
  alsoActiveFor?: string[]
}

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Today', Icon: TodayIcon },
  { href: '/schedule', label: 'Calendar', Icon: CalendarIcon },
  { href: '/players', label: 'People', Icon: PeopleIcon },
  { href: '/settings', label: 'More', Icon: MoreIcon, alsoActiveFor: ['/payments', '/help', '/programs'] },
]

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(prefix + '/')

export function TabBar({ role }: { role: MembershipRole }) {
  const pathname = usePathname()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)

  const isActive = (tab: Tab) =>
    matches(pathname, tab.href) || (tab.alsoActiveFor ?? []).some((p) => matches(pathname, p))

  const go = (href: string) => {
    setCreateOpen(false)
    router.push(href)
  }

  return (
    <>
      <nav
        className="absolute left-0 right-0 bottom-0 z-30 border-t border-line px-2 pt-[6px] pb-1"
        style={{ background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(14px)' }}
      >
        <div className="flex items-center">
          {TABS.slice(0, 2).map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(tab)} />
          ))}

          <div className="flex-1 flex justify-center">
            <button
              onClick={() => setCreateOpen(true)}
              aria-label="Quick add"
              className="w-14 h-14 rounded-full bg-accent flex items-center justify-center -mt-[28px] border-4 border-white shadow-fab"
            >
              <svg
                width="26"
                height="26"
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
            <TabLink key={tab.href} tab={tab} active={isActive(tab)} />
          ))}
        </div>
        {/* Home indicator bar from the design. */}
        <div className="flex justify-center pt-[7px]">
          <div className="w-[134px] h-[5px] rounded-r3 bg-ink opacity-[.85]" />
        </div>
      </nav>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)}>
        <SheetTitle>Quick Add</SheetTitle>

        <QuickAddRow
          title="Private Lesson"
          subtitle="One player, one-on-one"
          onClick={() => go('/schedule/new?type=private')}
          first
        >
          <PeopleIcon color="#1677EE" />
        </QuickAddRow>

        <QuickAddRow
          title="Person"
          subtitle="Add a player to your roster"
          onClick={() => go('/players/new')}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1677EE"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="10" cy="8.6" r="3.4" />
            <path d="M3.5 19.5c.8-3.6 3.3-5.4 6.5-5.4s5.7 1.8 6.5 5.4M19 8v6M16 11h6" />
          </svg>
        </QuickAddRow>

        <QuickAddRow
          title="Program"
          subtitle="Recurring clinics and camps"
          onClick={() => go('/programs')}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1677EE"
            strokeWidth="1.9"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <circle cx="9" cy="8.8" r="3" />
            <path d="M3.5 19c.7-3.1 2.8-4.7 5.5-4.7s4.8 1.6 5.5 4.7" />
            <circle cx="16.8" cy="9.6" r="2.5" />
            <path d="M16.2 14.5c2.3.3 3.8 1.7 4.3 4.5" />
          </svg>
        </QuickAddRow>

        {role === 'owner' ? (
          <QuickAddRow
            title="Revenue"
            subtitle="Record money you’ve received"
            onClick={() => go('/payments?record=1')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1677EE"
              strokeWidth="1.9"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <rect x="3" y="6.5" width="18" height="12" rx="2.5" />
              <circle cx="12" cy="12.5" r="2.4" />
            </svg>
          </QuickAddRow>
        ) : null}

        <button
          onClick={() => setCreateOpen(false)}
          className="w-full h-12 rounded-r13 bg-accent_soft text-accent_text text-t15 font-bold mt-4 text-center"
        >
          Close
        </button>
      </Sheet>
    </>
  )
}

function QuickAddRow({
  title,
  subtitle,
  onClick,
  children,
  first = false,
}: {
  title: string
  subtitle: string
  onClick: () => void
  children: ReactNode
  first?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-[13px] bg-card border border-line rounded-r14 px-4 py-[14px] ${
        first ? 'mt-4' : 'mt-[10px]'
      }`}
    >
      <div className="w-10 h-10 rounded-r12 bg-accent_soft flex items-center justify-center shrink-0">
        {children}
      </div>
      <div className="flex-1 text-left">
        <div className="text-t15 font-bold">{title}</div>
        <div className="text-t125 text-muted mt-[1px]">{subtitle}</div>
      </div>
      <span className="text-chevron text-t17">›</span>
    </button>
  )
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
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
