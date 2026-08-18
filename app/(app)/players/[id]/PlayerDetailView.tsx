'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import {
  Avatar,
  Card,
  Chevron,
  DetailHeader,
  SectionLabel,
} from '@/components/ui/primitives'
import { Button } from '@/components/ui/controls'
import { Dialog, useToast } from '@/components/ui/overlays'
import {
  deletePlayerAction,
  setPlayerArchivedAction,
} from '@/lib/actions/players'
import { firstName } from '@/lib/domain/dates'

interface Tile {
  next: string
  activity: string
  attendance: string
  outstanding: string
  outstandingRaw: number
}

export function PlayerDetailView({
  player,
  tiles,
  upcoming,
  history,
  hasAnySession,
  paymentSummary,
}: {
  player: {
    id: string
    name: string
    level: string
    archived: boolean
    notes: string
    phone: string
    email: string
  }
  tiles: Tile
  upcoming: Array<{ id: string; line1: string; line2: string }>
  history: Array<{
    id: string
    line1: string
    line2: string
    right: string
    rightColor: string
  }>
  hasAnySession: boolean
  paymentSummary: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [dialog, setDialog] = useState<'archive' | 'delete' | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [pending, startTransition] = useTransition()

  const toggleArchive = () => {
    if (player.archived) {
      startTransition(async () => {
        const result = await setPlayerArchivedAction({
          playerId: player.id,
          archived: false,
        })
        if (result.ok) {
          toast(`${firstName(player.name)} restored to active`)
          router.refresh()
        } else {
          toast(result.error)
        }
      })
      return
    }
    setDialog('archive')
  }

  const doArchive = () =>
    startTransition(async () => {
      const result = await setPlayerArchivedAction({
        playerId: player.id,
        archived: true,
      })
      setDialog(null)
      if (result.ok) {
        toast('Player archived')
        router.refresh()
      } else {
        toast(result.error)
      }
    })

  const doDelete = () =>
    startTransition(async () => {
      const result = await deletePlayerAction({
        playerId: player.id,
        confirmation: confirmName,
      })
      setDialog(null)
      if (result.ok) {
        toast('Player deleted')
        router.push('/players')
        router.refresh()
      } else {
        toast(result.error)
      }
    })

  const tileList = [
    { key: 'Next', value: tiles.next, color: '#171918', href: null },
    { key: 'Activity', value: tiles.activity, color: '#171918', href: null },
    { key: 'Attendance', value: tiles.attendance, color: '#171918', href: null },
    {
      key: 'Outstanding',
      value: tiles.outstanding,
      color: tiles.outstandingRaw > 0 ? '#96690F' : '#171918',
      href:
        tiles.outstandingRaw > 0
          ? `/payments?tab=pending&player=${player.id}`
          : null,
    },
  ]

  return (
    <ScreenBody className="px-5">
      <DetailHeader
        backHref="/players"
        title={<div />}
        right={
          <Link
            href={`/players/${player.id}/edit`}
            className="text-t13 font-semibold text-accent px-1 py-2"
          >
            Edit
          </Link>
        }
      />

      <div className="flex items-center gap-[14px] mt-3">
        <Avatar name={player.name} size={54} />
        <div>
          <div className="text-t22 font-bold tracking-tight15">{player.name}</div>
          <div className="text-t13 text-muted mt-[2px]">{player.level}</div>
        </div>
      </div>

      {player.archived ? (
        <div className="mt-[14px] bg-neutral_chip rounded-r12 px-[14px] py-[10px] text-t125 font-semibold text-muted text-center">
          Archived — hidden from active lists and pickers
        </div>
      ) : (
        <Link
          href={`/schedule/new?type=private&player=${player.id}`}
          className="h-12 rounded-r12 bg-accent text-white text-t15 font-semibold flex items-center justify-center mt-4"
        >
          Schedule Session
        </Link>
      )}

      <div className="grid grid-cols-2 gap-[10px] mt-[14px]">
        {tileList.map((tile) => {
          const inner = (
            <>
              <div className="flex items-center justify-between">
                <div className="text-t11 text-muted font-medium">{tile.key}</div>
                {tile.href ? <span className="text-chevron text-t13">›</span> : null}
              </div>
              <div
                className="text-t17 font-bold mt-1 tnum"
                style={{ color: tile.color }}
              >
                {tile.value}
              </div>
            </>
          )
          return tile.href ? (
            <Link
              key={tile.key}
              href={tile.href}
              className="bg-card border border-line rounded-r14 px-[14px] py-3"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={tile.key}
              className="bg-card border border-line rounded-r14 px-[14px] py-3"
            >
              {inner}
            </div>
          )
        })}
      </div>

      {player.notes.trim() ? (
        <div className="mt-6">
          <SectionLabel>Coach notes</SectionLabel>
          <div className="bg-card border border-line rounded-r14 mt-[10px] px-4 py-[14px] text-t14 leading-[1.55] pretty">
            {player.notes}
          </div>
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <div className="mt-6">
          <SectionLabel>Upcoming</SectionLabel>
          <div className="bg-card border border-line rounded-r14 mt-[10px] overflow-hidden">
            {upcoming.map((row, index) => (
              <Link
                key={row.id}
                href={`/sessions/${row.id}`}
                className={`flex items-center gap-3 px-4 py-3 ${
                  index === 0 ? '' : 'border-t border-divider'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-t14 font-semibold">{row.line1}</div>
                  <div className="text-t125 text-muted mt-[1px]">{row.line2}</div>
                </div>
                <span className="text-chevron text-t16">›</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {!hasAnySession ? (
        <div className="mt-6 bg-card border border-line rounded-r14 p-[22px] text-center">
          <div className="text-t14 font-semibold">No session history yet</div>
          <div className="text-t125 text-muted mt-[3px]">Schedule their first session.</div>
          <Link
            href={`/schedule/new?type=private&player=${player.id}`}
            className="h-11 rounded-r11 bg-ink text-shell text-t135 font-semibold flex items-center justify-center mt-[14px]"
          >
            Schedule First Session
          </Link>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-6">
          <SectionLabel>History</SectionLabel>
          <div className="bg-card border border-line rounded-r14 mt-[10px] overflow-hidden">
            {history.map((row, index) => (
              <Link
                key={row.id}
                href={`/sessions/${row.id}`}
                className={`flex items-center gap-3 px-4 py-3 ${
                  index === 0 ? '' : 'border-t border-divider'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-t14 font-semibold">{row.line1}</div>
                  <div className="text-t125 text-muted mt-[1px]">{row.line2}</div>
                </div>
                <span
                  className="text-t12 font-semibold"
                  style={{ color: row.rightColor }}
                >
                  {row.right}
                </span>
                <span className="text-chevron text-t16">›</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <SectionLabel>Payments</SectionLabel>
        <Link
          href={`/payments?tab=pending&player=${player.id}`}
          className="bg-card border border-line rounded-r14 mt-[10px] px-4 py-[14px] flex items-center"
        >
          <div className="flex-1 text-t135 font-semibold">{paymentSummary}</div>
          <span className="text-chevron text-t16">›</span>
        </Link>
      </div>

      {player.phone || player.email ? (
        <div className="mt-6">
          <SectionLabel>Contact</SectionLabel>
          <div className="bg-card border border-line rounded-r14 mt-[10px] px-4 py-[2px]">
            {player.phone ? (
              <div className="flex justify-between py-[11px]">
                <span className="text-t13 text-muted">Phone</span>
                <span className="text-t135 font-semibold tnum">{player.phone}</span>
              </div>
            ) : null}
            {player.email ? (
              <div
                className={`flex justify-between py-[11px] ${
                  player.phone ? 'border-t border-divider' : ''
                }`}
              >
                <span className="text-t13 text-muted">Email</span>
                <span className="text-t135 font-semibold">{player.email}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-[26px] grid grid-cols-2 gap-[10px]">
        <Link
          href={`/players/${player.id}/edit`}
          className="h-[46px] rounded-r12 border border-line bg-card text-t14 font-semibold flex items-center justify-center"
        >
          Edit
        </Link>
        <Button tone="plain" size="sm" onClick={toggleArchive} disabled={pending}>
          {player.archived ? 'Restore to Active' : 'Archive'}
        </Button>
      </div>
      <div className="mt-[10px]">
        <Button
          tone="danger"
          size="sm"
          onClick={() => {
            setConfirmName('')
            setDialog('delete')
          }}
          disabled={pending}
        >
          Delete Player
        </Button>
      </div>

      <Dialog
        open={dialog === 'archive'}
        title={`Archive ${player.name}?`}
        body="Archived players keep their history and balances but disappear from active lists and pickers. You can restore them anytime."
        buttons={[
          { label: 'Cancel', tone: 'plain', onClick: () => setDialog(null) },
          { label: 'Archive', tone: 'ink', onClick: doArchive },
        ]}
      />

      <Dialog
        open={dialog === 'delete'}
        title={`Delete ${player.name}?`}
        body={`This removes the player from active use while preserving historical financial records. Type ${player.name} to continue.`}
        input={{
          value: confirmName,
          onChange: setConfirmName,
          placeholder: player.name,
        }}
        buttons={[
          { label: 'Cancel', tone: 'plain', onClick: () => setDialog(null) },
          {
            label: 'Delete Player',
            tone: 'danger',
            onClick: doDelete,
            disabled: confirmName.trim() !== player.name,
          },
        ]}
      />
    </ScreenBody>
  )
}
