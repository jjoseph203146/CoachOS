'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import { Dialog, useToast } from '@/components/ui/overlays'
import { Avatar, Card, DetailHeader, Notice, SectionLabel } from '@/components/ui/primitives'
import { removeMemberAction, revokeInviteAction } from '@/lib/actions/team'
import { copyText } from '@/lib/client/clipboard'
import type { OpenInvite, TeamMember } from '@/lib/services/team'

const daysLeft = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))

export function TeamView({
  members,
  invites,
}: {
  members: TeamMember[]
  invites: OpenInvite[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [removing, setRemoving] = useState<TeamMember | null>(null)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        toast(message)
        router.refresh()
      } else {
        toast(result.error ?? 'Something went wrong.')
      }
    })

  const copyLink = async (token: string) => {
    const ok = await copyText(`${window.location.origin}/invite/${token}`)
    toast(ok ? 'Invitation link copied' : 'Couldn’t copy — select and copy the link manually')
  }

  return (
    <ScreenBody className="px-5">
      <DetailHeader backHref="/settings" title={<div />} />

      <div className="flex items-center justify-between mt-4">
        <div className="text-t26 font-extrabold tracking-tight2">Team</div>
        <Link
          href="/settings/team/invite"
          className="h-10 px-4 rounded-r13 bg-accent text-white text-t14 font-bold flex items-center"
        >
          Invite
        </Link>
      </div>

      <Card className="mt-4">
        {members.map((member, index) => (
          <div
            key={member.membershipId}
            className={`flex items-center gap-3 px-4 py-[12px] ${
              index === 0 ? '' : 'border-t border-divider'
            }`}
          >
            <Avatar name={member.name} size={40} />
            <div className="flex-1 min-w-0">
              <div className="text-t145 font-bold truncate">
                {member.name}
                {member.isYou ? <span className="text-muted font-medium"> · You</span> : null}
              </div>
              <div className="text-t12 text-muted">
                {member.role === 'owner' ? 'Owner' : 'Coach'}
              </div>
            </div>
            {member.role === 'coach' && !member.isYou ? (
              <button
                onClick={() => setRemoving(member)}
                className="text-t12 font-semibold text-danger_fg px-2 py-1"
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </Card>

      {invites.length > 0 ? (
        <>
          <div className="mt-[26px]">
            <SectionLabel>Pending invitations</SectionLabel>
          </div>
          <Card className="mt-[10px]">
            {invites.map((invite, index) => (
              <div
                key={invite.id}
                className={`px-4 py-3 ${index === 0 ? '' : 'border-t border-divider'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-t14 font-semibold truncate">{invite.email}</div>
                    <div className="text-t12 text-muted">
                      Coach · expires in {daysLeft(invite.expiresAt)} days
                    </div>
                  </div>
                  <span className="text-t115 font-semibold px-2 py-[3px] rounded-full bg-warn_bg text-warn_fg shrink-0">
                    Pending
                  </span>
                </div>
                <div className="flex gap-4 mt-2">
                  <button
                    onClick={() => copyLink(invite.token)}
                    className="text-t12 font-bold text-accent"
                  >
                    Copy link
                  </button>
                  <button
                    disabled={pending}
                    onClick={() =>
                      run(() => revokeInviteAction({ inviteId: invite.id }), 'Invitation revoked')
                    }
                    className="text-t12 font-bold text-danger_fg"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      <div className="mt-5">
        <Notice title="Revenue and organization settings are owner-only.">
          Coaches can run sessions, take attendance and manage your roster. They don’t see
          revenue or balances, and can’t change prices, the team or business settings.
        </Notice>
      </div>

      <Dialog
        open={!!removing}
        title={`Remove ${removing?.name.split(' ')[0] ?? ''}?`}
        body="They lose access to this academy straight away. Sessions they ran and everything else stay as they are."
        buttons={[
          { label: 'Keep on Team', tone: 'plain', onClick: () => setRemoving(null) },
          {
            label: 'Remove',
            tone: 'danger',
            onClick: () => {
              const target = removing!
              setRemoving(null)
              run(
                () => removeMemberAction({ membershipId: target.membershipId }),
                `${target.name.split(' ')[0]} removed`,
              )
            },
          },
        ]}
      />
    </ScreenBody>
  )
}
