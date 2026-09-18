'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Segmented } from '@/components/ui/controls'
import { Avatar, Card, DetailHeader } from '@/components/ui/primitives'
import { Dialog, useToast } from '@/components/ui/overlays'
import { saveAttendanceAction, skipAttendanceAction } from '@/lib/actions/sessions'
import { setSessionCoachesAction } from '@/lib/actions/team'
import type { AttendanceStatus } from '@/lib/domain/types'

interface Row {
  playerId: string
  name: string
  level: string
  attendance: AttendanceStatus
  /** The planning list: who was expected. Only meaningful when `planned`. */
  expected: boolean
}

/**
 * Attendance marking.
 *
 * Two explicit buttons per player — never a tap-to-cycle control. Tapping the
 * button that is already active clears it back to `unmarked`, which is what
 * the prototype does. "Skip" is a separate, deliberate session-level decision.
 */
export function AttendanceView({
  sessionId,
  typeLabel,
  title,
  when,
  rows,
  planned,
  coaches,
}: {
  sessionId: string
  typeLabel: string
  title: string
  when: string
  rows: Row[]
  /** Program occurrences have an expected list; show Expected / All Enrolled. */
  planned: boolean
  /** Team members, for "coaches who worked" (program sessions only). */
  coaches: Array<{ membershipId: string; name: string; worked: boolean }>
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(
    Object.fromEntries(rows.map((row) => [row.playerId, row.attendance])),
  )
  const [skipOpen, setSkipOpen] = useState(false)
  const [tab, setTab] = useState<'expected' | 'all'>('expected')
  const [worked, setWorked] = useState<Record<string, boolean>>(
    Object.fromEntries(coaches.map((c) => [c.membershipId, c.worked])),
  )
  const [pending, startTransition] = useTransition()

  // On the Expected tab, someone who wasn't expected and is still unmarked is
  // out of the way; anyone already marked stays visible so nothing hides a mark.
  const visibleRows =
    planned && tab === 'expected'
      ? rows.filter((row) => row.expected || marks[row.playerId] !== 'unmarked')
      : rows
  const expectedCount = rows.filter(
    (row) => row.expected || marks[row.playerId] !== 'unmarked',
  ).length

  const set = (playerId: string, value: 'present' | 'absent') =>
    setMarks((current) => ({
      ...current,
      // Tapping the active choice again clears the mark.
      [playerId]: current[playerId] === value ? 'unmarked' : value,
    }))

  const allPresent = () =>
    setMarks((current) => ({
      ...current,
      ...Object.fromEntries(visibleRows.map((row) => [row.playerId, 'present' as const])),
    }))

  const clearAll = () =>
    setMarks((current) => ({
      ...current,
      ...Object.fromEntries(visibleRows.map((row) => [row.playerId, 'unmarked' as const])),
    }))

  const markedCount = visibleRows.filter(
    (row) => marks[row.playerId] === 'present' || marks[row.playerId] === 'absent',
  ).length
  const percent = visibleRows.length ? Math.round((markedCount / visibleRows.length) * 100) : 0

  const save = () =>
    startTransition(async () => {
      const result = await saveAttendanceAction({
        sessionId,
        marks: rows.map((row) => ({
          playerId: row.playerId,
          attendance: marks[row.playerId] ?? 'unmarked',
        })),
      })
      if (!result.ok) {
        toast(result.error)
        return
      }
      if (coaches.length > 0) {
        const recorded = await setSessionCoachesAction({
          sessionId,
          membershipIds: coaches.filter((c) => worked[c.membershipId]).map((c) => c.membershipId),
        })
        if (!recorded.ok) {
          toast(recorded.error)
          return
        }
      }
      toast('Attendance saved')
      router.push(`/sessions/${sessionId}`)
      router.refresh()
    })

  const doSkip = () =>
    startTransition(async () => {
      const result = await skipAttendanceAction({ sessionId })
      setSkipOpen(false)
      if (!result.ok) {
        toast(result.error)
        return
      }
      toast('Attendance skipped')
      router.push(`/sessions/${sessionId}`)
      router.refresh()
    })

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-10">
      <DetailHeader backHref={`/sessions/${sessionId}`} title="Attendance" />

      <div className="mt-[18px]">
        <div className="text-t13 font-semibold text-muted">
          {typeLabel}
        </div>
        <div className="text-t22 font-bold tracking-tight15 mt-[6px]">{title}</div>
        <div className="text-t13 text-muted mt-[3px]">{when}</div>
      </div>

      <div className="mt-[18px]">
        <div className="text-t12 font-semibold text-muted tnum">
          {markedCount} / {visibleRows.length} marked
        </div>
        <div className="h-[5px] bg-line rounded-r3 mt-[7px] overflow-hidden">
          <div
            className="h-full bg-accent rounded-r3 transition-[width] duration-[250ms] ease"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {planned ? (
        <div className="mt-4">
          <Segmented
            options={[
              { value: 'expected', label: `Expected (${expectedCount})` },
              { value: 'all', label: `All Enrolled (${rows.length})` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      ) : null}

      <div className="flex gap-[10px] mt-4">
        <button
          onClick={allPresent}
          className="flex-1 h-10 rounded-r10 border border-accent_line bg-card text-accent_dark text-t13 font-semibold flex items-center justify-center"
        >
          All Present
        </button>
        <button
          onClick={clearAll}
          className="flex-1 h-10 rounded-r10 border border-line bg-card text-muted text-t13 font-semibold flex items-center justify-center"
        >
          Clear
        </button>
      </div>

      {visibleRows.length > 0 ? (
        <Card className="mt-[14px]">
          {visibleRows.map((row, index) => {
            const mark = marks[row.playerId]
            return (
              <div
                key={row.playerId}
                className={`px-4 py-[14px] ${index === 0 ? '' : 'border-t border-divider'}`}
              >
                <div className="flex items-center gap-[11px]">
                  <Avatar name={row.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-t15 font-semibold">{row.name}</div>
                    <div className="text-t12 text-subtle mt-[1px]">{row.level}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-[11px]">
                  <button
                    onClick={() => set(row.playerId, 'present')}
                    aria-pressed={mark === 'present'}
                    className="flex-1 h-11 rounded-r11 border text-t14 font-semibold flex items-center justify-center"
                    style={
                      mark === 'present'
                        ? { background: '#159A55', color: '#FFFFFF', borderColor: '#159A55' }
                        : { background: '#F0F3F7', color: '#7B8796', borderColor: '#F0F3F7' }
                    }
                  >
                    Present
                  </button>
                  <button
                    onClick={() => set(row.playerId, 'absent')}
                    aria-pressed={mark === 'absent'}
                    className="flex-1 h-11 rounded-r11 border text-t14 font-semibold flex items-center justify-center"
                    style={
                      mark === 'absent'
                        ? { background: '#EF4759', color: '#FFFFFF', borderColor: '#EF4759' }
                        : { background: '#F0F3F7', color: '#7B8796', borderColor: '#F0F3F7' }
                    }
                  >
                    Absent
                  </button>
                </div>
              </div>
            )
          })}
        </Card>
      ) : (
        <div className="text-center pt-[30px] px-5">
          <div className="text-t14 font-semibold">No players on this session</div>
          <div className="text-t125 text-muted mt-[3px]">
            Add players from the session screen first.
          </div>
        </div>
      )}

      {coaches.length > 0 ? (
        <div className="mt-6">
          <div className="text-t17 font-extrabold text-ink">Coaches who worked</div>
          <Card className="mt-[10px]">
            {coaches.map((coach, index) => {
              const on = worked[coach.membershipId]
              return (
                <div
                  key={coach.membershipId}
                  className={`flex items-center gap-3 px-4 py-[10px] ${
                    index === 0 ? '' : 'border-t border-divider'
                  }`}
                >
                  <div className="flex-1 text-t14 font-semibold">{coach.name}</div>
                  <button
                    onClick={() => setWorked((cur) => ({ ...cur, [coach.membershipId]: !on }))}
                    aria-pressed={on}
                    className="h-9 px-3 rounded-r10 text-t13 font-bold"
                    style={
                      on
                        ? { background: '#159A55', color: '#FFFFFF' }
                        : { background: '#F0F3F7', color: '#7B8796' }
                    }
                  >
                    {on ? 'Worked' : 'Add'}
                  </button>
                </div>
              )
            })}
          </Card>
        </div>
      ) : null}

      <button
        onClick={save}
        disabled={pending}
        className="w-full h-12 rounded-r13 bg-accent text-white text-t15 font-bold flex items-center justify-center mt-[18px] disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Done'}
      </button>

      <button
        onClick={() => setSkipOpen(true)}
        className="w-full text-center text-t13 font-semibold text-subtle p-4"
      >
        Skip attendance for this session
      </button>

      <Dialog
        open={skipOpen}
        title="Skip attendance?"
        body="This session won’t count as missing attendance and will be excluded from attendance metrics."
        buttons={[
          { label: 'Cancel', tone: 'plain', onClick: () => setSkipOpen(false) },
          { label: 'Skip Attendance', tone: 'ink', onClick: doSkip },
        ]}
      />
    </div>
  )
}
