'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Member = {
  user_id: string
  role: string
  department: string | null
  name: string | null
  email: string | null
  image_url: string | null
  is_you: boolean
  joined_at: string
}

const roleLabel: Record<string, string> = {
  compliance_officer: 'Compliance Officer',
  department_head: 'Department Head',
}

export default function MembersList({
  members,
  token,
  canManage,
}: {
  members: Member[]
  token: string
  canManage: boolean
}) {
  const router = useRouter()
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(memberId: string) {
    if (!confirm('Remove this member? They will lose access to the organization.')) return
    setRemoving(memberId)
    setError(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/org/members/${memberId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail ?? 'Remove failed')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="divide-y divide-gray-50">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 py-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              {m.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-gray-400">
                  {(m.name ?? m.email ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {m.name ?? m.email ?? `User …${m.user_id.slice(-6)}`}
                </p>
                {m.is_you && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">You</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  m.role === 'compliance_officer'
                    ? 'bg-[#ff5d03]/10 text-[#ff5d03]'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {roleLabel[m.role] ?? m.role}
                </span>
                {m.department && (
                  <span className="text-xs text-gray-400">{m.department}</span>
                )}
                {m.email && m.name && (
                  <span className="text-xs text-gray-400 truncate">{m.email}</span>
                )}
              </div>
            </div>

            {canManage && !m.is_you && (
              <button
                onClick={() => remove(m.user_id)}
                disabled={removing === m.user_id}
                className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-100 hover:border-red-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {removing === m.user_id ? 'Removing…' : 'Remove'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
