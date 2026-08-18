'use client'

import { useEffect } from 'react'

/** Registers the service worker so CoachOS is installable to a home screen. */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failure must never break the app.
      })
    }
    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])
  return null
}
