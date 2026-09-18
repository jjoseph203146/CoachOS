'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import { Button } from '@/components/ui/controls'
import { useToast } from '@/components/ui/overlays'
import { Card, DetailHeader, ErrorBanner, Notice } from '@/components/ui/primitives'
import { saveAvailabilityAction } from '@/lib/actions/availability'
import { WEEKDAY_NAMES, type HoursWindow } from '@/lib/domain/availability'
import { formatShort, formatTime } from '@/lib/domain/dates'
import type { StrandedLesson } from '@/lib/services/availability'

interface DayState {
  on: boolean
  startMin: number
  endMin: number
}

const DEFAULT_HOURS = { startMin: 9 * 60, endMin: 17 * 60 }
// Monday first, as a working week reads.
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const TIMES = Array.from({ length: 37 }, (_, index) => 300 + index * 30) // 5:00 AM – 11:00 PM

export function AvailabilityView({ initial }: { initial: HoursWindow[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<StrandedLesson[]>([])

  const [days, setDays] = useState<Record<number, DayState>>(() =>
    Object.fromEntries(
      ORDER.map((weekday) => {
        const window = initial.find((w) => w.weekday === weekday)
        return [
          weekday,
          window
            ? { on: true, startMin: window.startMin, endMin: window.endMin }
            : { on: false, ...DEFAULT_HOURS },
        ]
      }),
    ),
  )

  const patch = (weekday: number, next: Partial<DayState>) => {
    setConflicts([])
    setDays((current) => ({ ...current, [weekday]: { ...current[weekday], ...next } }))
  }

  const save = () =>
    startTransition(async () => {
      setError('')
      setConflicts([])
      const result = await saveAvailabilityAction({
        windows: ORDER.filter((weekday) => days[weekday].on).map((weekday) => ({
          weekday,
          startMin: days[weekday].startMin,
          endMin: days[weekday].endMin,
        })),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (!result.data.saved) {
        setConflicts(result.data.conflicts)
        return
      }
      toast('Availability saved')
      router.refresh()
    })

  const anyOn = ORDER.some((weekday) => days[weekday].on)

  return (
    <ScreenBody className="px-5">
      <DetailHeader backHref="/settings" title="Private Availability" />

      <div className="mt-4">
        <Notice title="Controls the times offered for private lessons.">
          Programs can run outside these hours. You can still book a lesson outside them on
          purpose.
        </Notice>
      </div>

      <Card className="mt-4">
        {ORDER.map((weekday, index) => {
          const day = days[weekday]
          return (
            <div
              key={weekday}
              className={`px-4 py-3 ${index === 0 ? '' : 'border-t border-divider'}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-t15 font-bold">{WEEKDAY_NAMES[weekday]}</div>
                <button
                  onClick={() => patch(weekday, { on: !day.on })}
                  role="switch"
                  aria-checked={day.on}
                  aria-label={`${WEEKDAY_NAMES[weekday]} available`}
                  className="w-[46px] h-[28px] rounded-full p-[3px] transition-colors"
                  style={{ background: day.on ? '#1677EE' : '#D5DCE5' }}
                >
                  <div
                    className="w-[22px] h-[22px] rounded-full bg-white transition-transform"
                    style={{ transform: day.on ? 'translateX(18px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
              {day.on ? (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <select
                    value={day.startMin}
                    aria-label={`${WEEKDAY_NAMES[weekday]} start`}
                    onChange={(event) => {
                      const startMin = Number(event.target.value)
                      patch(weekday, {
                        startMin,
                        endMin: day.endMin > startMin ? day.endMin : startMin + 60,
                      })
                    }}
                    className="h-[42px] border border-field rounded-r10 bg-card px-3 text-t14 font-medium"
                  >
                    {TIMES.slice(0, -1).map((minute) => (
                      <option key={minute} value={minute}>
                        {formatTime(minute)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={day.endMin}
                    aria-label={`${WEEKDAY_NAMES[weekday]} end`}
                    onChange={(event) => patch(weekday, { endMin: Number(event.target.value) })}
                    className="h-[42px] border border-field rounded-r10 bg-card px-3 text-t14 font-medium"
                  >
                    {TIMES.filter((minute) => minute > day.startMin).map((minute) => (
                      <option key={minute} value={minute}>
                        {formatTime(minute)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="text-t125 text-muted mt-[2px]">Unavailable</div>
              )}
            </div>
          )
        })}
      </Card>

      {!anyOn ? (
        <div className="text-t12 text-subtle mt-3 leading-[1.5]">
          With no days turned on, private lessons aren’t restricted to any hours.
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <div className="mt-4 bg-danger_bg rounded-r14 p-3 text-danger_fg">
          <div className="text-t14 font-bold">Can’t save this availability</div>
          <div className="text-t125 mt-1 leading-[1.45]">
            {conflicts.length === 1
              ? 'A confirmed lesson would fall outside these hours.'
              : `${conflicts.length} confirmed lessons would fall outside these hours.`}{' '}
            Update or cancel {conflicts.length === 1 ? 'it' : 'them'} first.
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {conflicts.map((lesson) => (
              <Link
                key={lesson.sessionId}
                href={`/sessions/${lesson.sessionId}`}
                className="bg-card rounded-r11 px-3 py-[10px] flex items-center justify-between text-ink"
              >
                <div>
                  <div className="text-t13 font-bold">{lesson.playerName}</div>
                  <div className="text-t12 text-muted">
                    {formatShort(lesson.date)} · {formatTime(lesson.startMin)}–
                    {formatTime(lesson.startMin + lesson.durationMin)}
                  </div>
                </div>
                <span className="text-t12 font-bold text-danger_fg">View Lesson</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="mt-4 mb-4">
        <Button size="lg" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save Availability'}
        </Button>
      </div>
    </ScreenBody>
  )
}
