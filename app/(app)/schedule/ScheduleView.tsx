'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import { EventCard } from '@/components/ui/primitives'
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
  kind: 'private' | 'group'
  title: string
  subtitle: string
  cancelled: boolean
  ended: boolean
  badge: { text: string; bg: string; fg: string } | null
}

export function ScheduleView({ rows, today }: { rows: ScheduleRow[]; today: string }) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
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
        <div className="text-t26 font-extrabold tracking-tight2">
          {monthFull(view === 'month' ? `${month}-01` : selected)}{' '}
          {(view === 'month' ? month : selected).slice(0, 4)}
        </div>
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
      </div>

      <div className="px-5 pt-3">
        <Segmented
          options={[
            { value: 'day', label: 'Day' },
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

      {view !== 'month' ? (
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
                  background: isSelected ? '#1677EE' : '#FFFFFF',
                  borderColor: isSelected ? '#1677EE' : iso === today ? '#9AA6B4' : '#DCE5EF',
                }}
              >
                <div
                  className="text-t10 font-semibold"
                  style={{ color: isSelected ? '#CFE3FD' : '#8A94A3' }}
                >
                  {dowShort(iso).toUpperCase()}
                </div>
                <div
                  className="text-t16 font-bold tnum"
                  style={{ color: isSelected ? '#FFFFFF' : '#0D1B31' }}
                >
                  {dayOfMonth(iso)}
                </div>
                <div className="flex gap-[3px] h-1 mt-[2px]">
                  {Array.from({ length: dots }, (_, index) => (
                    <div
                      key={index}
                      className="w-1 h-1 rounded-full"
                      style={{ background: isSelected ? '#5CA7FF' : '#1677EE' }}
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
            <div />
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
                className="text-center text-t105 font-semibold text-subtle py-1"
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
                    background: isSelected ? '#1677EE' : 'transparent',
                    borderColor:
                      cell.iso === today && !isSelected ? '#CFE3FD' : 'transparent',
                  }}
                >
                  <div
                    className="text-t13 font-semibold tnum"
                    style={{ color: isSelected ? '#FFFFFF' : '#0D1B31' }}
                  >
                    {cell.day}
                  </div>
                  <div className="flex gap-[2px] h-[3px]">
                    {Array.from({ length: dots }, (_, dot) => (
                      <div
                        key={dot}
                        className="w-[3px] h-[3px] rounded-full"
                        style={{ background: isSelected ? '#5CA7FF' : '#1677EE' }}
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

        {visible.length > 0 && view === 'day' ? (
          <DayTimeline rows={visible} />
        ) : null}

        {visible.length > 0 && view !== 'day' ? (
          <div className="mt-3 flex flex-col gap-[10px]">
            {visible.map((row) => (
              <EventCard
                key={row.id}
                href={`/sessions/${row.id}`}
                time={formatTime(row.startMin)}
                title={row.title}
                sub={[row.subtitle, `${row.durationMin} min`].filter(Boolean).join(' · ')}
                kind={row.kind}
                tag={row.badge ? { text: row.badge.text, color: row.badge.fg } : undefined}
                dim={row.ended && !row.cancelled}
                strike={row.cancelled}
              />
            ))}
          </div>
        ) : null}

        {active.length === 0 && (!showCancelled || cancelled.length === 0) ? (
          <div className="bg-card border border-line rounded-r16 px-[22px] py-[26px] mt-3 text-center">
            <div className="text-t145 font-semibold">No sessions scheduled</div>
            <div className="text-t13 text-muted mt-[3px]">This day is open.</div>
            <Link
              href={`/schedule/new?type=private&date=${selected}`}
              className="h-[46px] rounded-r13 bg-accent text-white text-t145 font-bold flex items-center justify-center mt-4"
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

const HOUR_PX = 64

/**
 * Hour-by-hour view of one day (the spec's Day view). Blocks are positioned by
 * start and duration; sessions that overlap — the app lets you double-book on
 * purpose — sit side by side instead of hiding each other.
 */
function DayTimeline({ rows }: { rows: ScheduleRow[] }) {
  const first = Math.min(...rows.map((row) => row.startMin))
  const last = Math.max(...rows.map((row) => row.startMin + row.durationMin))
  const from = Math.min(8 * 60, Math.floor(first / 60) * 60)
  const to = Math.max(20 * 60, Math.ceil(last / 60) * 60)
  const hours = Array.from({ length: (to - from) / 60 }, (_, index) => from + index * 60)

  // Greedy column packing: each block goes in the first column that has freed up.
  const sorted = [...rows].sort((a, b) => a.startMin - b.startMin)
  const columnEnds: number[] = []
  const placed = sorted.map((row) => {
    let column = columnEnds.findIndex((end) => end <= row.startMin)
    if (column === -1) column = columnEnds.length
    columnEnds[column] = row.startMin + row.durationMin
    return { row, column }
  })
  const columns = columnEnds.length

  return (
    <div className="relative mt-3 ml-[38px]" style={{ height: hours.length * HOUR_PX }}>
      {hours.map((minute, index) => (
        <div
          key={minute}
          className="absolute left-0 right-0 border-t border-line"
          style={{ top: index * HOUR_PX }}
        >
          <span className="absolute -left-[38px] -top-[7px] text-t10 text-subtle tnum">
            {formatTime(minute).replace(':00', '')}
          </span>
        </div>
      ))}
      {placed.map(({ row, column }) => {
        const isPrivate = row.kind === 'private'
        return (
          <Link
            key={row.id}
            href={`/sessions/${row.id}`}
            className={`absolute rounded-r10 border-l-[3px] px-[9px] py-[6px] overflow-hidden ${
              isPrivate ? 'bg-accent_soft border-l-accent' : 'bg-success_bg border-l-success'
            }`}
            style={{
              top: ((row.startMin - from) / 60) * HOUR_PX + 1,
              height: Math.max((row.durationMin / 60) * HOUR_PX - 2, 30),
              left: `calc(${(column / columns) * 100}% + 5px)`,
              width: `calc(${100 / columns}% - 5px)`,
              opacity: row.cancelled ? 0.55 : row.ended ? 0.75 : 1,
            }}
          >
            <div
              className="text-t115 font-bold truncate"
              style={{ textDecoration: row.cancelled ? 'line-through' : 'none' }}
            >
              {row.title}
            </div>
            <div className="text-t105 text-muted truncate tnum">
              {[row.subtitle, formatTime(row.startMin)].filter(Boolean).join(' · ')}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
