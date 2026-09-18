import Link from 'next/link'
import { requireCoachPage } from '@/lib/auth'
import { coachClock, coachGraceMinutes } from '@/lib/services/clock'
import { ScreenBody } from '@/components/shell/AppShell'
import {
  Chevron,
  EmptyCard,
  EventCard,
  Notice,
  SectionLabel,
  StatPair,
  StatTile,
} from '@/components/ui/primitives'
import {
  firstName,
  formatLong,
  formatRelative,
  formatTime,
  greetingFor,
} from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import { loadDashboard, type DashboardModel } from '@/lib/services/dashboard'
import { AccountButton } from './AccountButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Today — CoachOS' }

type TodayItem = DashboardModel['alsoToday'][number]

/** "1.5h", "2h", "45m" — scheduled time for the coach's stat tile. */
function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')}h`
}

export default async function DashboardPage() {
  const { store, coachId, coach, role } = await requireCoachPage()
  const isOwner = role === 'owner'
  const clock = coachClock(coach)
  const model = await loadDashboard(store, coachId, clock, coachGraceMinutes(coach))

  const today = clock.today
  const up = model.upNext

  const playerName = (item: { enrollments: Array<{ playerId: string }> }) =>
    model.players.get(item.enrollments[0]?.playerId ?? '')?.name ?? ''

  // Today's list: the next session (when it is later today) plus the rest.
  const todayItems: TodayItem[] = [
    ...(up && up.session.date === today
      ? [
          {
            session: up.session,
            enrollments: up.enrollments,
            ended: false,
            attendanceMissing: false,
            skipped: up.session.attendanceSkipped,
            complete: up.attendanceComplete,
          },
        ]
      : []),
    ...model.alsoToday,
  ].sort((a, b) => a.session.startMin - b.session.startMin)

  // Overdue money is the owner's business; attendance is everyone's.
  const attention = model.attention.filter((item) => isOwner || item.kind === 'attendance')

  const card = (item: TodayItem) => {
    const { session } = item
    const isPrivate = session.type === 'private'
    const kind = isPrivate
      ? 'private'
      : session.programId && model.programAudiences.get(session.programId) === 'adult'
        ? 'adult'
        : 'group'
    const detail = [
      isPrivate
        ? playerName(item)
        : session.programId
          ? `${item.enrollments.filter((e) => e.expected).length} expected`
          : `${item.enrollments.length} players`,
      `${session.durationMin} min`,
      session.location,
    ].filter(Boolean)
    const tag = item.attendanceMissing
      ? { text: 'Attendance missing', color: '#96690F' }
      : item.ended && item.complete
        ? { text: 'Done', color: '#6D7A8C' }
        : item.ended && item.skipped
          ? { text: 'Skipped', color: '#6D7A8C' }
          : undefined
    const canTakeAttendance =
      item.enrollments.length > 0 && !item.complete && !item.skipped && !item.attendanceMissing
    return (
      <EventCard
        key={session.id}
        href={`/sessions/${session.id}`}
        time={formatTime(session.startMin)}
        title={isPrivate ? 'Private Lesson' : session.name}
        sub={detail.join(' · ')}
        kind={kind}
        tag={tag}
        dim={item.ended}
        action={
          canTakeAttendance
            ? { href: `/sessions/${session.id}/attendance`, label: 'Attendance' }
            : undefined
        }
      />
    )
  }

  return (
    <ScreenBody className="px-5 pt-1">
      <div className="flex items-start justify-between pt-3">
        <div>
          <div className="text-t13 text-muted">{greetingFor(clock.nowMinutes)},</div>
          <div className="text-t26 font-extrabold tracking-tight2 leading-[1.05]">
            {firstName(coach.name)}
          </div>
          <div className="text-t13 text-muted mt-[3px]">{formatLong(today)}</div>
        </div>
        <AccountButton name={coach.name} businessName={coach.businessName} />
      </div>

      {model.isNewCoach ? (
        <div className="bg-card border border-line rounded-r18 shadow-card p-[22px] mt-6">
          <div className="text-t13 font-bold text-accent">Welcome</div>
          <div className="text-t20 font-bold tracking-tight1 mt-2">
            Set up your coaching base
          </div>
          <div className="text-t14 text-muted mt-[6px] leading-[1.55] pretty">
            Add your first player, then schedule your first session. Everything else
            builds from there.
          </div>
          <Link
            href="/players/new"
            className="h-12 rounded-r13 bg-accent text-white text-t15 font-bold flex items-center justify-center mt-[18px]"
          >
            Add Your First Player
          </Link>
          <Link
            href="/schedule/new?type=private"
            className="h-12 rounded-r13 bg-accent_soft text-accent_text text-t15 font-bold flex items-center justify-center mt-[10px]"
          >
            Schedule a Session
          </Link>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mt-4">
            <StatTile value={String(model.todayCount)} label="Sessions Today" />
            <StatTile value={String(model.todayPlayers)} label="Players Today" />
            {isOwner ? (
              <StatTile
                value={formatMoney(model.revenueTodayCents)}
                label="Revenue Today"
                tone="success"
              />
            ) : (
              <StatTile value={formatHours(model.todayMinutes)} label="Scheduled Today" />
            )}
          </div>

          <div className="flex items-center justify-between mt-[22px]">
            <SectionLabel>Today</SectionLabel>
            <Link href="/schedule" className="text-t13 font-semibold text-accent">
              See All
            </Link>
          </div>

          {todayItems.length > 0 ? (
            <div className="mt-[10px] flex flex-col gap-[10px]">{todayItems.map(card)}</div>
          ) : up ? (
            <>
              <div className="text-t13 text-muted mt-2">Nothing else scheduled today.</div>
              <div className="mt-4">
                <SectionLabel>Up next</SectionLabel>
              </div>
              <div className="mt-[10px]">
                <EventCard
                  href={`/sessions/${up.session.id}`}
                  time={formatTime(up.session.startMin)}
                  title={up.session.type === 'private' ? 'Private Lesson' : up.session.name}
                  sub={[
                    formatRelative(up.session.date, today),
                    up.session.type === 'private'
                      ? playerName(up)
                      : `${up.enrollments.length} players`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  kind={up.session.type === 'private' ? 'private' : 'group'}
                />
              </div>
            </>
          ) : (
            <div className="mt-[10px]">
              <EmptyCard title="No sessions scheduled" body="Your calendar is clear.">
                <Link
                  href="/schedule/new?type=private"
                  className="h-[46px] rounded-r13 bg-accent text-white text-t145 font-bold flex items-center justify-center mt-[14px]"
                >
                  Schedule Session
                </Link>
              </EmptyCard>
            </div>
          )}

          <div className="mt-[14px] flex flex-col gap-[10px]">
            {attention.length === 0 ? (
              <Notice tone="green" title="Attendance is caught up">
                Nothing needs marking right now.
              </Notice>
            ) : (
              attention.map((item, index) =>
                item.kind === 'attendance' ? (
                  <Notice
                    key={`${item.kind}-${index}`}
                    tone="red"
                    title="Attendance Needed"
                    href={item.href}
                    action={item.cta}
                  >
                    {item.subject} · {item.date ? formatRelative(item.date, today) : ''} ·
                    Attendance hasn’t been recorded yet.
                  </Notice>
                ) : (
                  <Notice
                    key={`${item.kind}-${index}`}
                    tone="red"
                    title={item.main}
                    href={item.href}
                    action={item.cta}
                  >
                    {item.sub}
                  </Notice>
                ),
              )
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

          {isOwner ? (
            <div className="mt-[26px]">
              <SectionLabel>Outstanding</SectionLabel>
              {model.outstandingCents > 0 ? (
                <Link
                  href="/payments?tab=pending"
                  className="bg-card border border-line rounded-r18 shadow-card mt-[10px] px-[18px] py-4 flex items-center"
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
                <div className="bg-card border border-line rounded-r18 mt-[10px] px-[18px] py-4">
                  <div className="text-t14 font-semibold">No outstanding payments</div>
                  <div className="text-t125 text-muted mt-[2px]">Everything is settled.</div>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </ScreenBody>
  )
}
