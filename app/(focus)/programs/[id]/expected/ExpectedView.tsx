'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Chip, SearchInput } from '@/components/ui/controls'
import { useToast } from '@/components/ui/overlays'
import { Avatar, Card, ErrorBanner, Notice } from '@/components/ui/primitives'
import { setExpectedAction } from '@/lib/actions/programs'

interface Row {
  playerId: string
  name: string
  expected: boolean
}

/** Planning only: who do we expect at this occurrence? Attendance is recorded separately. */
export function ExpectedView({
  programId,
  programName,
  sessionId,
  sessions,
  when,
  rows,
}: {
  programId: string
  programName: string
  sessionId: string
  sessions: Array<{ id: string; label: string }>
  when: string
  rows: Row[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [expected, setExpected] = useState<Record<string, boolean>>(
    Object.fromEntries(rows.map((row) => [row.playerId, row.expected])),
  )

  const count = Object.values(expected).filter(Boolean).length
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? rows.filter((row) => row.name.toLowerCase().includes(q)) : rows
  }, [rows, query])

  const changed = rows.filter((row) => expected[row.playerId] !== row.expected)

  const save = () =>
    startTransition(async () => {
      setError('')
      const result = await setExpectedAction({
        sessionId,
        marks: changed.map((row) => ({ playerId: row.playerId, expected: expected[row.playerId] })),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast('Expected list saved')
      router.push(`/programs/${programId}`)
      router.refresh()
    })

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-10">
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="w-9 h-9 rounded-full border border-line bg-card flex items-center justify-center text-t18 text-ink pb-[2px]"
        >
          ‹
        </button>
        <div className="text-t15 font-bold">Expected</div>
        <div className="w-9" />
      </div>

      <div className="mt-4">
        <Notice title="Planning only.">Actual attendance is recorded separately.</Notice>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div>
          <div className="text-t17 font-extrabold">{programName}</div>
          <div className="text-t125 text-muted">{when}</div>
        </div>
        <span className="text-t12 font-semibold px-[10px] py-[5px] rounded-full bg-success_bg text-success tnum">
          {count} expected
        </span>
      </div>

      {sessions.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto mt-3 pb-1">
          {sessions.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              selected={s.id === sessionId}
              size="sm"
              onClick={() => router.replace(`/programs/${programId}/expected?session=${s.id}`)}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search enrolled players" />
      </div>

      <Card className="mt-3">
        {visible.map((row, index) => {
          const on = expected[row.playerId]
          return (
            <div
              key={row.playerId}
              className={`flex items-center gap-3 px-4 py-[10px] ${
                index === 0 ? '' : 'border-t border-divider'
              }`}
            >
              <Avatar name={row.name} size={34} />
              <div className="flex-1 text-t14 font-semibold">{row.name}</div>
              <button
                onClick={() => setExpected((cur) => ({ ...cur, [row.playerId]: !on }))}
                aria-pressed={on}
                className="h-9 px-3 rounded-r10 text-t13 font-bold"
                style={
                  on
                    ? { background: '#159A55', color: '#FFFFFF' }
                    : { background: '#F0F3F7', color: '#7B8796' }
                }
              >
                {on ? 'Expected' : 'Add'}
              </button>
            </div>
          )
        })}
        {visible.length === 0 ? (
          <div className="text-t13 text-muted text-center py-5">No one matches.</div>
        ) : null}
      </Card>

      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <button
        onClick={save}
        disabled={pending || changed.length === 0}
        className="w-full h-12 rounded-r13 bg-accent text-white text-t15 font-bold mt-4 disabled:opacity-40"
      >
        {pending ? 'Saving…' : 'Save Expected List'}
      </button>
    </div>
  )
}
