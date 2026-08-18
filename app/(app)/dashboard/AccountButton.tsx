'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOutAction } from '@/lib/actions/auth'
import { Avatar } from '@/components/ui/primitives'
import { Dialog, Sheet } from '@/components/ui/overlays'

/** The avatar in the dashboard header opens the account sheet. */
export function AccountButton({
  name,
  businessName,
}: {
  name: string
  businessName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Account"
        className="mt-1 shrink-0"
      >
        <Avatar name={name} size={40} dark />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="flex items-center gap-3 px-[2px] pb-[14px] border-b border-divider">
          <Avatar name={name} size={44} dark />
          <div>
            <div className="text-t15 font-bold">{name}</div>
            <div className="text-t125 text-muted mt-[1px]">
              {businessName || 'Independent coach'}
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            setOpen(false)
            router.push('/settings')
          }}
          className="w-full flex items-center px-[2px] py-[15px] border-b border-divider"
        >
          <div className="flex-1 text-left text-t15 font-semibold">Settings</div>
          <span className="text-chevron text-t17">›</span>
        </button>
        <button
          onClick={() => {
            setOpen(false)
            router.push('/help')
          }}
          className="w-full flex items-center px-[2px] py-[15px] border-b border-divider"
        >
          <div className="flex-1 text-left text-t15 font-semibold">Help</div>
          <span className="text-chevron text-t17">›</span>
        </button>
        <button
          onClick={() => {
            setOpen(false)
            setConfirmSignOut(true)
          }}
          className="w-full text-left px-[2px] py-[15px] text-t15 font-semibold text-danger_fg"
        >
          Sign Out
        </button>
      </Sheet>

      <Dialog
        open={confirmSignOut}
        title="Sign out?"
        body="You’ll need to sign in again to reach your sessions."
        buttons={[
          { label: 'Cancel', tone: 'plain', onClick: () => setConfirmSignOut(false) },
          {
            label: 'Sign Out',
            tone: 'danger',
            onClick: () => {
              void signOutAction()
            },
          },
        ]}
      />
    </>
  )
}
