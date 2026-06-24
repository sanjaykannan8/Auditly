import { getServerToken, getServerUser } from '@/lib/auth-server'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import RealtimeNotifier from '../_components/RealtimeNotifier'
import HeaderActions from './_components/HeaderActions'
import Sidebar from './_components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = await getServerToken()
  const me = await getServerUser()

  if (!token || !me) {
    redirect('/sign-in')
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/onboarding/status`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  // Expired / invalid token → back to sign-in
  if (res.status === 401) {
    redirect('/sign-in')
  }

  let orgId: string | null = null
  if (res.ok) {
    const status = await res.json()
    if (status.needs_setup) {
      redirect('/onboarding')
    }
    if (status.role === 'department_head') {
      redirect('/head/maps')
    }
    orgId = status.org_id
  }
  const userId = me.id

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {orgId && <RealtimeNotifier userId={userId} orgId={orgId} />}
      <header
        className="flex items-center justify-between px-6 bg-white border-b border-gray-200 flex-shrink-0 z-10"
        style={{ height: '64px' }}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Image
            src="/dash.png"
            alt="Auditly"
            width={32}
            height={32}
            className="object-contain"
          />
          <span className="text-xl font-bold text-gray-900 tracking-tight">Auditly</span>
        </Link>
        <HeaderActions />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
