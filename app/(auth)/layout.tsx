import { AppShell } from '@/components/shell/AppShell'

/** Signed-out screens. No tab bar, no auth requirement. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
