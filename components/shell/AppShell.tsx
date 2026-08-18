import type { ReactNode } from 'react'

/**
 * The phone shell from the prototype: a centred 430px column on a #E7E8E2
 * canvas, filling the viewport height, with a 1px ring.
 *
 * The design prototype drew a fake status bar (time, signal, battery) at the
 * top. That was a canvas prop, not part of the product, so it is not rendered
 * here — the real device draws its own.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex justify-center items-stretch bg-canvas">
      <div className="w-full max-w-[430px] h-[100dvh] bg-shell relative flex flex-col overflow-hidden shadow-shell">
        {children}
      </div>
    </div>
  )
}

/** Scrollable body. `padBottom` leaves room for the floating tab bar. */
export function ScreenBody({
  children,
  className = '',
  padBottom = true,
}: {
  children: ReactNode
  className?: string
  padBottom?: boolean
}) {
  return (
    <div
      className={`flex-1 overflow-y-auto ${padBottom ? 'pb-[130px]' : 'pb-10'} ${className}`}
    >
      {children}
    </div>
  )
}
