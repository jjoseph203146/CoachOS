import Link from 'next/link'
import { getStore } from '@/lib/data'
import { previewInvite } from '@/lib/services/team'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Join your team — CoachOS', robots: { index: false, follow: false } }

const MESSAGE = {
  accepted: {
    title: 'This invitation was already used',
    body: 'Sign in to reach your account, or ask the academy owner for a new invitation.',
  },
  revoked: {
    title: 'This invitation was cancelled',
    body: 'Ask the academy owner to send you a new one.',
  },
  expired: {
    title: 'This invitation has expired',
    body: 'Invitations last 14 days. Ask the academy owner to send you a new one.',
  },
} as const

/** Public: the page an invitation link lands on. It reveals nothing beyond the link's purpose. */
export default async function InvitePage({ params }: { params: { token: string } }) {
  const preview = await previewInvite(getStore(), params.token)

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-10 flex flex-col justify-center">
      <div className="text-center">
        <div className="text-t26 font-extrabold tracking-tight3">
          Coach<span className="text-accent">OS</span>
        </div>
      </div>

      {preview && preview.state === 'open' ? (
        <>
          <div className="bg-card border border-line rounded-r18 shadow-card p-5 mt-7 text-center">
            <div className="text-t13 text-muted">You’re invited to join</div>
            <div className="text-t22 font-extrabold tracking-tight2 mt-1">
              {preview.businessName || 'a coaching team'}
            </div>
            <div className="text-t13 text-muted mt-1">as a Coach</div>
          </div>

          <Link
            href={`/signup?invite=${encodeURIComponent(params.token)}`}
            className="h-[50px] rounded-r13 bg-accent text-white text-t155 font-bold flex items-center justify-center mt-5"
          >
            Create your account
          </Link>
          <div className="text-t125 text-muted text-center mt-3 leading-[1.55]">
            You’ll sign up with <b className="text-ink">{preview.email}</b>, the address this
            invitation was made for.
          </div>
          <div className="text-t115 text-subtle text-center mt-4 leading-[1.55]">
            Already have a CoachOS account with that address? An account belongs to one
            team, so ask the owner to invite a different address.
          </div>
        </>
      ) : (
        <div className="bg-card border border-line rounded-r18 shadow-card p-5 mt-7 text-center">
          <div className="text-t16 font-bold">
            {preview ? MESSAGE[preview.state as keyof typeof MESSAGE].title : 'This link isn’t valid'}
          </div>
          <div className="text-t13 text-muted mt-2 leading-[1.55]">
            {preview
              ? MESSAGE[preview.state as keyof typeof MESSAGE].body
              : 'Check that you copied the whole link, or ask the academy owner to send it again.'}
          </div>
          <Link href="/login" className="block text-t13 font-semibold text-accent mt-4">
            Go to sign in
          </Link>
        </div>
      )}
    </div>
  )
}
