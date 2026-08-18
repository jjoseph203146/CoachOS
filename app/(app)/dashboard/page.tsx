import Link from 'next/link'
import { requireCoachPage } from '@/lib/auth'
import { ScreenBody } from '@/components/shell/AppShell'
import {
  Card,
  Chevron,
  EmptyCard,
  SectionLabel,
  StatPair,
} from '@/components/ui/primitives'
import {
  firstName,
  formatLong,
  formatRelative,
  formatTime,
  greetingFor,
  todayISO,
} from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import { loadDashboard } from '@/lib/services/dashboard'
import { defaultClock } from '@/lib/services/players'
import { AccountButton } from './AccountButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Home — CoachOS' }

export default async function DashboardPage() {
  const { store, coachId, coach } = await requireCoachPage()
  const clock = defaultClock()
  const model = await loadDashboard(store, coachId, clock)

  const today = todayISO()
  const up = model.upNext

  return (
    <ScreenBody className="px-5 pt-1">
      <div className="flex items-start justify-between pt-3">
        <div>
          <SectionLabel>{formatLong(today)}</SectionLabel>
          <div className="text-t25 font-bold tracking-tight2 mt-[6px]">
            {greetingFor(clock.nowMinutes)}, {firstName(coach.name)}
          </div>
        </div>
        <AccountButton name={coach.name} businessName={coach.businessName} />
      </div>

      {model.isNewCoach ? (
        <div className="bg-card border border-line rounded-r18 shadow-card p-[22px] mt-6">
          <div className="font-mono text-t105 font-medium tracking-mono uppercase text-accent">
            Welcome
          </div>
          <div className="text-t20 font-bold tracking-tight1 mt-2">
            Set up your coaching base
          </div>
          <div className="text-t14 text-muted mt-[6px] leading-[1.55] pretty">
            Add your first player, then schedule your first session. Everything else
            builds from there.
          </div>
          <Link
            href="/players/new"
            className="h-12 rounded-r12 bg-accent text-white text-t15 font-semibold flex items-center justify-center mt-[18px]"
          >
            Add Your First Player
          </Link>
          <Link
            href="/schedule/new?type=private"
            className="h-12 rounded-r12 bg-card border border-line text-ink text-t15 font-semibold flex items-center justify-center mt-[10px]"
          >
            Schedule a Session
          </Link>
        </div>
      ) : (
        <>
          {up ? (
            <div className="bg-card border border-line rounded-r18 shadow-card_hi p-[18px] mt-6">
              <div className="flex items-center justify-between">
                <div className="font-mono text-t105 font-semibold tracking-mono uppercase text-accent">
                  Up next
                </div>
                <div className="font-mono text-t105 font-medium tracking-mono3 uppercase text-faint">
                  {up.session.type === 'private'
                    ? 'Private lesson'
                    : `Group · ${up.enrollments.length} of ${up.session.capacity ?? up.enrollments.length}`}
                </div>
              </div>
              <Link href={`/sessions/${up.session.id}`} className="block">
                <div className="text-t22 font-bold tracking-tight15 mt-3">
                  {up.session.type === 'private'
                    ? (model.players.get(up.enrollments[0]?.playerId ?? '')?.name ??
                      up.session.name)
                    : up.session.name}
                </div>
                <div className="text-t14 text-muted mt-[5px]">
                  {formatRelative(up.session.date, today)} · {formatTime(up.session.startMin)} ·{' '}
                  {up.session.durationMin} min
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-t15 font-semibold tnum">
                    {up.session.isFree
                      ? 'Free session'
                      : `${formatMoney(up.session.priceCents)}${
                          up.session.type === 'group' ? ' per player' : ''
                        }`}
                  </span>
                  {up.outstandingCents > 0 ? (
                    <span className="text-t12 font-semibold px-[9px] py-[3px] rounded-full bg-warn_bg text-warn_fg">
                      {up.session.type === 'private'
                        ? 'Unpaid'
                        : `${formatMoney(up.outstandingCents)} unpaid`}
                    </span>
                  ) : null}
                </div>
              </Link>
              {up.session.date === today &&
              up.enrollments.length > 0 &&
              !up.attendanceComplete ? (
                <Link
                  href={`/sessions/${up.session.id}/attendance`}
                  className="h-12 rounded-r12 bg-accent text-white text-t15 font-semibold flex items-center justify-center mt-4"
                >
                  Take Attendance
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyCard title="No sessions scheduled" body="Your calendar is clear.">
                <Link
                  href="/schedule/new?type=private"
                  className="h-[46px] rounded-r12 bg-accent text-white text-t145 font-semibold flex items-center justify-center mt-[14px]"
                >
                  Schedule Session
                </Link>
              </EmptyCard>
            </div>
          )}

          {model.alsoToday.length > 0 ? (
            <div className="mt-[26px]">
              <SectionLabel>Also today</SectionLabel>
              <Card className="mt-[10px] shadow-card">
                {model.alsoToday.map((item, index) => {
                  const tag = item.attendanceMissing
                    ? { text: 'Attendance missing', color: '#96690F' }
                    : item.ended && item.complete
                      ? { text: 'Done', color: '#6B706C' }
                      : item.ended && item.skipped
                        ? { text: 'Skipped', color: '#6B706C' }
                        : null
                  return (
                    <Link
                      key={item.session.id}
                      href={`/sessions/${item.session.id}`}
                      className={`flex items-center gap-3 px-4 py-[13px] ${
                        index === 0 ? '' : 'border-t border-divider'
                      }`}
                      style={{ opacity: item.ended ? 0.62 : 1 }}
                    >
                      <div className="w-16 shrink-0 text-t13 font-semibold tnum">
                        {formatTime(item.session.startMin)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-t145 font-semibold">
                          {item.session.type === 'private'
                            ? 'Private Lesson'
                            : item.session.name}
                        </div>
                        <div className="text-t125 text-muted mt-[1px]">
                          {item.session.type === 'private'
                            ? (model.players.get(item.enrollments[0]?.playerId ?? '')
                                ?.name ?? '')
                            : `${item.enrollments.length} players`}
                        </div>
                      </div>
                      {tag ? (
                        <span
                          className="text-t115 font-semibold"
                          style={{ color: tag.color }}
                        >
                          {tag.text}
                        </span>
                      ) : null}
                      <Chevron />
                    </Link>
                  )
                })}
              </Card>
            </div>
          ) : null}

          <div className="mt-[26px]">
            <SectionLabel>Needs attention</SectionLabel>
            {model.attention.length === 0 ? (
              <div className="bg-card border border-line rounded-r16 mt-[10px] p-4 flex items-center gap-[10px]">
                <div className="w-[22px] h-[22px] rounded-full bg-accent_soft text-accent_dark flex items-center justify-center text-t12 font-bold shrink-0">
                  ✓
                </div>
                <div className="text-t14 text-muted">All attendance is caught up</div>
              </div>
            ) : (
              <Card className="mt-[10px]">
                {model.attention.map((item, index) => (
                  <Link
                    key={`${item.kind}-${index}`}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-[14px] ${
                      index === 0 ? '' : 'border-t border-divider'
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: item.dot }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-t145 font-semibold">{item.main}</div>
                      <div className="text-t125 text-muted mt-[1px]">{item.sub}</div>
                    </div>
                    <span className="text-t125 font-semibold text-accent shrink-0">
                      {item.cta}
                    </span>
                  </Link>
                ))}
              </Card>
            )}
          </div>

          <div className="mt-[26px]">
            <SectionLabel>This month</SectionLabel>
            <div className="mt-[10px]">
              <StatPair
                left={{ label: 'Sessions', value: String(model.monthSessions) }}
                right={{
                  label: 'Attendance',
                  value:
                    model.monthAttendanceRate === null
                      ? '—'
                      : `${model.monthAttendanceRate}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-[26px]">
            <SectionLabel>Outstanding</SectionLabel>
            {model.outstandingCents > 0 ? (
              <Link
                href="/payments?tab=pending"
                className="bg-card border border-line rounded-r16 shadow-card mt-[10px] px-[18px] py-4 flex items-center"
              >
                <div className="flex-1">
                  <div className="text-t24 font-bold tnum">
                    {formatMoney(model.outstandingCents)}
                  </div>
                  <div className="text-t125 text-muted mt-[2px]">
                    {model.outstandingPlayers} player
                    {model.outstandingPlayers === 1 ? '' : 's'} · {model.outstandingCharges}{' '}
                    charge{model.outstandingCharges === 1 ? '' : 's'}
                  </div>
                </div>
                <Chevron />
              </Link>
            ) : (
              <div className="bg-card border border-line rounded-r16 mt-[10px] px-[18px] py-4">
                <div className="text-t14 font-semibold">No outstanding payments</div>
                <div className="text-t125 text-muted mt-[2px]">Everything is settled.</div>
              </div>
            )}
          </div>
        </>
      )}
    </ScreenBody>
  )
}
