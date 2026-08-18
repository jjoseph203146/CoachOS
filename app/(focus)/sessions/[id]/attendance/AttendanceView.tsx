'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Avatar, Card, DetailHeader } from '@/components/ui/primitives'
import { Dialog, useToast } from '@/components/ui/overlays'
import { saveAttendanceAction, skipAttendanceAction } from '@/lib/actions/sessions'
import type { AttendanceStatus } from '@/lib/domain/types'

interface Row {
  playerId: string
  name: string
  level: string
  attendance: AttendanceStatus
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
}: {
  sessionId: string
  typeLabel: string
  title: string
  when: string
  rows: Row[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(
    Object.fromEntries(rows.map((row) => [row.playerId, row.attendance])),
  )
  const [skipOpen, setSkipOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const set = (playerId: string, value: 'present' | 'absent') =>
    setMarks((current) => ({
      ...current,
      // Tapping the active choice again clears the mark.
      [playerId]: current[playerId] === value ? 'unmarked' : value,
    }))

  const allPresent = () =>
    setMarks(Object.fromEntries(rows.map((row) => [row.playerId, 'present' as const])))

  const clearAll = () =>
    setMarks(Object.fromEntries(rows.map((row) => [row.playerId, 'unmarked' as const])))

  const markedCount = rows.filter(
    (row) => marks[row.playerId] === 'present' || marks[row.playerId] === 'absent',
  ).length
  const percent = rows.length ? Math.round((markedCount / rows.length) * 100) : 0

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
        <div className="font-mono text-t105 font-medium tracking-mono uppercase text-muted">
          {typeLabel}
        </div>
        <div className="text-t22 font-bold tracking-tight15 mt-[6px]">{title}</div>
        <div className="text-t13 text-muted mt-[3px]">{when}</div>
      </div>

      <div className="mt-[18px]">
        <div className="text-t12 font-semibold text-muted tnum">
          {markedCount} / {rows.length} marked
        </div>
        <div className="h-[5px] bg-line rounded-r3 mt-[7px] overflow-hidden">
          <div
            className="h-full bg-accent rounded-r3 transition-[width] duration-[250ms] ease"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

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

      {rows.length > 0 ? (
        <Card className="mt-[14px]">
          {rows.map((row, index) => {
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
                        ? { background: '#3FA66B', color: '#FFFFFF', borderColor: '#3FA66B' }
                        : { background: '#FFFFFF', color: '#171918', borderColor: '#E5E6E1' }
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
                        ? { background: '#171918', color: '#FFFFFF', borderColor: '#171918' }
                        : { background: '#FFFFFF', color: '#171918', borderColor: '#E5E6E1' }
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

      <button
        onClick={save}
        disabled={pending}
        className="w-full h-12 rounded-r12 bg-ink text-shell text-t15 font-semibold flex items-center justify-center mt-[18px] disabled:opacity-60"
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
