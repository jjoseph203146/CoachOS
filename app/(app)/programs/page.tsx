import Link from 'next/link'
import { requireCoachPage } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import { ScreenBody } from '@/components/shell/AppShell'
import { Chevron, EmptyCard, Notice } from '@/components/ui/primitives'
import { formatRelative, formatTime } from '@/lib/domain/dates'
import { weekdaysLabel } from '@/lib/domain/programs'
import { listPrograms } from '@/lib/services/programs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Programs — CoachOS' }

export default async function ProgramsPage() {
  const { store, coachId, coach, role } = await requireCoachPage()
  const clock = coachClock(coach)
  const items = await listPrograms(store, coachId, clock.today)
  const isOwner = role === 'owner'

  return (
    <ScreenBody className="px-5 pt-1">
      <div className="flex items-center justify-between pt-3">
        <div className="text-t26 font-extrabold tracking-tight2">Programs</div>
        {isOwner ? (
          <Link
            href="/programs/new"
            className="h-10 px-4 rounded-r13 bg-accent text-white text-t14 font-bold flex items-center"
          >
            + Create
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyCard
            title="No programs yet"
            body={
              isOwner
                ? 'Create a recurring clinic or camp with its price options.'
                : 'The academy owner sets up programs; they’ll appear here.'
            }
          >
            {isOwner ? (
              <Link
                href="/programs/new"
                className="h-[46px] rounded-r13 bg-accent text-white text-t145 font-bold flex items-center justify-center mt-4"
              >
                Create a Program
              </Link>
            ) : null}
          </EmptyCard>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-[10px]">
          {items.map(({ program, activeCount, nextOccurrence }) => (
            <Link
              key={program.id}
              href={`/programs/${program.id}`}
              className={`bg-card border border-line border-l-4 rounded-r18 shadow-card pl-3 pr-3 py-[13px] flex items-center gap-2 ${
                program.audience === 'adult' ? 'border-l-purple' : 'border-l-success'
              }`}
              style={{ opacity: program.status === 'ended' ? 0.6 : 1 }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-t145 font-bold truncate">
                  {program.name}
                  {program.status === 'ended' ? (
                    <span className="ml-2 text-t115 font-semibold text-muted">Ended</span>
                  ) : null}
                </div>
                <div className="text-t125 text-muted mt-[2px]">
                  {weekdaysLabel(program.weekdays)} · {formatTime(program.startMin)}
                </div>
                <div className="text-t125 text-muted mt-[1px]">
                  {[
                    `${activeCount} enrolled`,
                    program.ageRange ? `Ages ${program.ageRange}` : '',
                    nextOccurrence
                      ? `Next ${formatRelative(nextOccurrence.date, clock.today)}`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <Chevron />
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Notice title="Programs recur on a set schedule.">
          Each occurrence keeps its own expected list, attendance and status. Every
          participant pays the price they agreed, whatever the program’s standard
          options are today.
        </Notice>
      </div>

      <Link
        href="/schedule/new?type=group"
        className="block text-center text-t13 font-semibold text-accent mt-5 mb-2"
      >
        Schedule a one-off group session instead
      </Link>
    </ScreenBody>
  )
}
