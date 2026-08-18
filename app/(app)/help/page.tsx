import { ScreenBody } from '@/components/shell/AppShell'
import { DetailHeader } from '@/components/ui/primitives'

export const metadata = { title: 'Help — CoachOS' }

export default function HelpPage() {
  return (
    <ScreenBody className="px-5">
      <DetailHeader backHref="/dashboard" title="Help" />

      <div className="bg-card border border-line rounded-r14 mt-5 p-4">
        <div className="text-t14 font-bold">Getting started</div>
        <div className="text-t13 text-muted leading-[1.6] mt-[6px] pretty">
          Add players, then schedule sessions with the green + button. Priced sessions
          automatically create a pending charge per player — mark them paid as money comes
          in, and take attendance right from the session.
        </div>
      </div>

      <div className="bg-card border border-line rounded-r14 mt-3 p-4">
        <div className="text-t14 font-bold">Money is recorded, not moved</div>
        <div className="text-t13 text-muted leading-[1.6] mt-[6px] pretty">
          CoachOS never processes payments. “Mark Paid” records that you collected money in
          person, by transfer, or however you like.
        </div>
      </div>

      <div className="bg-card border border-line rounded-r14 mt-3 p-4">
        <div className="text-t14 font-bold">Balances are always derived</div>
        <div className="text-t13 text-muted leading-[1.6] mt-[6px] pretty">
          Every figure comes from the same sum: charges, minus payments, minus credits.
          Voided charges count for nothing. That is why the dashboard, a player’s page and
          the payments ledger can never disagree.
        </div>
      </div>

      <a
        href="mailto:support@coachos.app"
        className="bg-card border border-line rounded-r14 mt-3 px-4 py-[15px] flex items-center"
      >
        <div className="flex-1 text-t14 font-semibold text-ink">Contact support</div>
        <span className="text-chevron text-t16">›</span>
      </a>

      <div className="text-center text-t115 text-faint mt-[26px]">CoachOS 0.1</div>
    </ScreenBody>
  )
}
