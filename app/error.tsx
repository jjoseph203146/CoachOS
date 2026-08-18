'use client'

/**
 * Global error boundary. Renders the prototype's error state and never shows
 * the underlying exception — the detail is logged server-side instead.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-canvas font-sans text-ink">
        <div className="min-h-[100dvh] flex justify-center bg-canvas">
          <div className="w-full max-w-[430px] min-h-[100dvh] bg-shell flex flex-col justify-center text-center px-5">
            <div className="w-[52px] h-[52px] rounded-full bg-danger_bg text-danger_fg flex items-center justify-center text-t20 font-bold mx-auto">
              !
            </div>
            <div className="text-t17 font-bold mt-4">Something went wrong</div>
            <div className="text-t135 text-muted mt-[6px]">
              We couldn’t load your sessions.
            </div>
            <button
              onClick={reset}
              className="h-[46px] w-40 rounded-r12 bg-ink text-shell text-t14 font-semibold flex items-center justify-center mx-auto mt-5"
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
