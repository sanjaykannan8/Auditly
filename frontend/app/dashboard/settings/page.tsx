import { getServerToken } from '@/lib/auth-server'
import MembersList from './_components/MembersList'
import OrgNameForm from './_components/OrgNameForm'

async function getOrg(token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/org`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json()
}

export default async function SettingsPage() {
  const token = await getServerToken()
  const org = await getOrg(token!)

  if (!org) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Could not load organization settings.</p>
      </div>
    )
  }

  const isAdmin = org.role === 'compliance_officer'

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
        <p className="text-gray-500 mt-1 text-sm">Manage your organization profile and members.</p>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Profile</h2>
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo_url} alt="logo" width={64} height={64} className="object-contain p-1" />
            ) : (
              <span className="text-2xl font-bold text-gray-300">{org.name?.charAt(0) ?? '?'}</span>
            )}
          </div>
          <div className="flex-1">
            <OrgNameForm initialName={org.name} token={token!} canEdit={isAdmin} />
            <p className="text-xs text-gray-400 mt-3">
              Created {new Date(org.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Members <span className="text-gray-400 font-normal">({org.members.length})</span>
          </h2>
          {isAdmin && (
            <a
              href="/dashboard/departments"
              className="text-xs font-medium text-[#ff5d03] hover:text-[#e04f02]"
            >
              + Invite department heads
            </a>
          )}
        </div>
        <MembersList members={org.members} token={token!} canManage={isAdmin} />
      </div>
    </div>
  )
}
