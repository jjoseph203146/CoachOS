'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import { Card, Chevron } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/controls'
import {
  addDays,
  dayOfMonth,
  daysInMonth,
  dowFull,
  dowShort,
  firstDayOfMonthDow,
  formatTime,
  monthFull,
  pad2,
  shiftMonth,
} from '@/lib/domain/dates'

export interface ScheduleRow {
  id: string
  date: string
  startMin: number
  durationMin: number
  title: string
  subtitle: string
  cancelled: boolean
  ended: boolean
  badge: { text: string; bg: string; fg: string } | null
}

export function ScheduleView({ rows, today }: { rows: ScheduleRow[]; today: string }) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [selected, setSelected] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [showCancelled, setShowCancelled] = useState(false)

  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>()
    for (const row of rows) {
      const list = map.get(row.date) ?? []
      list.push(row)
      map.set(row.date, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.startMin - b.startMin)
    return map
  }, [rows])

  const liveCount = (date: string) =>
    (byDate.get(date) ?? []).filter((row) => !row.cancelled).length

  const dayRows = byDate.get(selected) ?? []
  const active = dayRows.filter((row) => !row.cancelled)
  const cancelled = dayRows.filter((row) => row.cancelled)
  const visible = showCancelled ? [...active, ...cancelled] : active

  // Week strip: two days back through eleven ahead, as the prototype does.
  const weekDays = Array.from({ length: 14 }, (_, index) => addDays(today, index - 2))

  const monthCells = useMemo(() => {
    const lead = firstDayOfMonthDow(month)
    const total = daysInMonth(month)
    const cells: Array<{ iso: string | null; day: number | null }> = []
    for (let i = 0; i < lead; i++) cells.push({ iso: null, day: null })
    for (let day = 1; day <= total; day++) {
      cells.push({ iso: `${month}-${pad2(day)}`, day })
    }
    return cells
  }, [month])

  const dayLabel =
    selected === today
      ? 'Today'
      : selected === addDays(today, 1)
        ? 'Tomorrow'
        : selected === addDays(today, -1)
          ? 'Yesterday'
          : dowFull(selected)

  return (
    <ScreenBody className="pt-1">
      <div className="flex items-center justify-between px-5 pt-3">
        <div className="text-t25 font-bold tracking-tight2">Schedule</div>
        <div className="flex items-center gap-2">
          {selected !== today ? (
            <button
              onClick={() => {
                setSelected(today)
                setMonth(today.slice(0, 7))
              }}
              className="text-t125 font-semibold text-accent px-3 py-[7px] border border-accent_line rounded-full bg-card"
            >
              Today
            </button>
          ) : null}
          <Segmented
            className="w-[142px]"
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={view}
            onChange={(next) => {
              setView(next)
              if (next === 'month') setMonth(selected.slice(0, 7))
            }}
          />
        </div>
      </div>

      {view === 'week' ? (
        <div className="flex gap-2 overflow-x-auto px-5 pt-4 pb-1">
          {weekDays.map((iso) => {
            const isSelected = iso === selected
            const dots = Math.min(liveCount(iso), 3)
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                className="shrink-0 w-[52px] pt-[9px] pb-2 rounded-r13 border flex flex-col items-center gap-[2px]"
                style={{
                  background: isSelected ? '#171918' : '#FFFFFF',
                  borderColor: isSelected ? '#171918' : iso === today ? '#B9BDB6' : '#E5E6E1',
                }}
              >
                <div
                  className="font-mono text-t95 tracking-mono4"
                  style={{ color: isSelected ? '#B9BDB6' : '#8A8E89' }}
                >
                  {dowShort(iso).toUpperCase()}
                </div>
                <div
                  className="text-t16 font-bold tnum"
                  style={{ color: isSelected ? '#F7F7F3' : '#171918' }}
                >
                  {dayOfMonth(iso)}
                </div>
                <div className="flex gap-[3px] h-1 mt-[2px]">
                  {Array.from({ length: dots }, (_, index) => (
                    <div
                      key={index}
                      className="w-1 h-1 rounded-full"
                      style={{ background: isSelected ? '#7BC79A' : '#3FA66B' }}
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="Previous month"
              className="w-[34px] h-[34px] rounded-full border border-line bg-card flex items-center justify-center text-t17 text-muted pb-[2px]"
            >
              ‹
            </button>
            <div className="text-t145 font-semibold">
              {monthFull(`${month}-01`)} {month.slice(0, 4)}
            </div>
            <button
              onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label="Next month"
              className="w-[34px] h-[34px] rounded-full border border-line bg-card flex items-center justify-center text-t17 text-muted pb-[2px]"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-[2px] mt-3">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((label) => (
              <div
                key={label}
                className="text-center font-mono text-t95 text-subtle py-1"
              >
                {label}
              </div>
            ))}
            {monthCells.map((cell, index) => {
              if (!cell.iso) return <div key={`blank-${index}`} className="h-[46px]" />
              const isSelected = cell.iso === selected
              const dots = Math.min(liveCount(cell.iso), 3)
              return (
                <button
                  key={cell.iso}
                  onClick={() => setSelected(cell.iso!)}
                  className="h-[46px] rounded-r10 border flex flex-col items-center justify-center gap-[3px]"
                  style={{
                    background: isSelected ? '#171918' : 'transparent',
                    borderColor:
                      cell.iso === today && !isSelected ? '#B9BDB6' : 'transparent',
                  }}
                >
                  <div
                    className="text-t13 font-semibold tnum"
                    style={{ color: isSelected ? '#F7F7F3' : '#171918' }}
                  >
                    {cell.day}
                  </div>
                  <div className="flex gap-[2px] h-[3px]">
                    {Array.from({ length: dots }, (_, dot) => (
                      <div
                        key={dot}
                        className="w-[3px] h-[3px] rounded-full"
                        style={{ background: isSelected ? '#7BC79A' : '#3FA66B' }}
                      />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="px-5 pt-5">
        <div className="flex items-baseline gap-2">
          <div className="text-t18 font-bold tracking-tight1">{dayLabel}</div>
          <div className="text-t13 text-muted">
            {monthFull(selected)} {dayOfMonth(selected)}
          </div>
        </div>

        {visible.length > 0 ? (
          <Card className="mt-3">
            {visible.map((row, index) => (
              <Link
                key={row.id}
                href={`/sessions/${row.id}`}
                className={`flex items-center gap-3 px-4 py-[14px] ${
                  index === 0 ? '' : 'border-t border-divider'
                }`}
                style={{ opacity: row.cancelled ? 0.55 : row.ended ? 0.72 : 1 }}
              >
                <div className="w-16 shrink-0">
                  <div className="text-t135 font-bold tnum">
                    {formatTime(row.startMin)}
                  </div>
                  <div className="text-t11 text-subtle mt-[1px]">{row.durationMin} min</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-t145 font-semibold"
                    style={{ textDecoration: row.cancelled ? 'line-through' : 'none' }}
                  >
                    {row.title}
                  </div>
                  <div
                    className="text-t125 text-muted mt-[1px]"
                    style={{ textDecoration: row.cancelled ? 'line-through' : 'none' }}
                  >
                    {row.subtitle}
                  </div>
                </div>
                {row.badge ? (
                  <span
                    className="text-t11 font-semibold px-2 py-[3px] rounded-full shrink-0"
                    style={{ background: row.badge.bg, color: row.badge.fg }}
                  >
                    {row.badge.text}
                  </span>
                ) : null}
                <Chevron />
              </Link>
            ))}
          </Card>
        ) : null}

        {active.length === 0 && (!showCancelled || cancelled.length === 0) ? (
          <div className="bg-card border border-line rounded-r16 px-[22px] py-[26px] mt-3 text-center">
            <div className="text-t145 font-semibold">No sessions scheduled</div>
            <div className="text-t13 text-muted mt-[3px]">This day is open.</div>
            <Link
              href={`/schedule/new?type=private&date=${selected}`}
              className="h-[46px] rounded-r12 bg-accent text-white text-t145 font-semibold flex items-center justify-center mt-4"
            >
              Schedule Session
            </Link>
          </div>
        ) : null}

        {cancelled.length > 0 ? (
          <button
            onClick={() => setShowCancelled((current) => !current)}
            className="w-full text-center text-t125 font-semibold text-muted p-4"
          >
            {showCancelled ? 'Hide cancelled' : `Show cancelled (${cancelled.length})`}
          </button>
        ) : null}
      </div>
    </ScreenBody>
  )
}
