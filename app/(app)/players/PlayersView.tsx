'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import {
  Avatar,
  Card,
  Chevron,
  EmptyCard,
  EmptyInline,
} from '@/components/ui/primitives'
import { Segmented, SearchInput } from '@/components/ui/controls'

export interface PlayerListRow {
  id: string
  name: string
  subtitle: string
  next: string
  outstanding: string
}

export function PlayersView({
  active,
  archived,
}: {
  active: PlayerListRow[]
  archived: PlayerListRow[]
}) {
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [query, setQuery] = useState('')

  const pool = tab === 'active' ? active : archived
  const trimmed = query.trim().toLowerCase()
  const rows = trimmed
    ? pool.filter((row) => row.name.toLowerCase().includes(trimmed))
    : pool

  return (
    <ScreenBody className="px-5 pt-1">
      <div className="flex items-center justify-between pt-3">
        <div className="text-t25 font-bold tracking-tight2">Players</div>
        <Link
          href="/players/new"
          aria-label="Add player"
          className="w-[38px] h-[38px] rounded-full bg-ink flex items-center justify-center"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#F7F7F3"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </div>

      <div className="mt-[14px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search players" />
      </div>

      <Segmented
        className="mt-3"
        options={[
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {rows.length > 0 ? (
        <Card className="mt-[14px]">
          {rows.map((row, index) => (
            <Link
              key={row.id}
              href={`/players/${row.id}`}
              className={`flex items-center gap-3 px-4 py-[13px] ${
                index === 0 ? '' : 'border-t border-divider'
              }`}
            >
              <Avatar name={row.name} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-t15 font-semibold">{row.name}</div>
                <div className="text-t125 text-muted mt-[1px]">{row.subtitle}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-t12 text-muted">{row.next}</div>
                {row.outstanding ? (
                  <div className="text-t125 font-bold text-warn_fg mt-[2px] tnum">
                    {row.outstanding}
                  </div>
                ) : null}
              </div>
              <Chevron />
            </Link>
          ))}
        </Card>
      ) : null}

      {rows.length === 0 && trimmed ? (
        <EmptyInline
          title={`No players match “${query}”`}
          body="Try a different name."
        />
      ) : null}

      {rows.length === 0 && !trimmed && tab === 'active' ? (
        <div className="mt-[14px]">
          <EmptyCard
            title="No players yet"
            body="Add your first player to start scheduling."
          >
            <Link
              href="/players/new"
              className="h-[46px] rounded-r12 bg-accent text-white text-t145 font-semibold flex items-center justify-center mt-4"
            >
              Add Your First Player
            </Link>
          </EmptyCard>
        </div>
      ) : null}

      {rows.length === 0 && !trimmed && tab === 'archived' ? (
        <EmptyInline
          title="No archived players"
          body="Players you archive appear here."
        />
      ) : null}
    </ScreenBody>
  )
}
