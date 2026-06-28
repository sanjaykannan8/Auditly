import { getServerToken, getServerUser } from '@/lib/auth-server'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import ProfileMenu from '../_components/ProfileMenu'
import RealtimeNotifier from '../_components/RealtimeNotifier'

export default async function HeadLayout({ children }: { children: React.ReactNode }) {
  const token = await getServerToken()
  const me = await getServerUser()

  if (!token || !me) {
    redirect('/sign-in')
  }

  const userId = me.id
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/onboarding/status`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    redirect('/sign-in')
  }

  const status = await res.json()

  if (status.needs_setup) {
    redirect('/onboarding')
  }

  if (status.role !== 'department_head') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {status.org_id && <RealtimeNotifier userId={userId} orgId={status.org_id} />}

      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Image src="/dash.png" alt="Auditly" width={28} height={28} className="object-contain" />
          <span className="text-lg font-bold text-gray-900 tracking-tight">Auditly</span>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <span className="text-xs font-semibold text-[#ff5d03] bg-[#ff5d03]/10 px-2.5 py-1 rounded-full">
            Department Head
          </span>
        </div>
        <ProfileMenu />
      </header>

      <main>{children}</main>
    </div>
  )
}
