import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/ui/overlays'
import { ServiceWorker } from '@/components/shell/ServiceWorker'

export const metadata: Metadata = {
  title: 'CoachOS',
  description: 'Your coaching command center — sessions, players, attendance and payments.',
  manifest: '/manifest.webmanifest',
  applicationName: 'CoachOS',
  appleWebApp: {
    capable: true,
    title: 'CoachOS',
    statusBarStyle: 'default',
  },
  icons: {
    // Derived from the master art in /icons/favicon.png (1254px, too heavy to
    // serve as a tab icon); regenerate these if that file changes.
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas font-sans text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  )
}
