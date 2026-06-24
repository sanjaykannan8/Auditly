import { getServerToken } from '@/lib/auth-server'
import { redirect } from 'next/navigation'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const token = await getServerToken()

  if (!token) {
    redirect('/sign-in')
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/onboarding/status`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (res.status === 401) {
    redirect('/sign-in')
  }

  if (res.ok) {
    const status = await res.json()
    // Already onboarded -> send to the right home, don't show the wizard again
    if (!status.needs_setup) {
      redirect(status.role === 'department_head' ? '/head/maps' : '/dashboard')
    }
  }

  return <>{children}</>
}
