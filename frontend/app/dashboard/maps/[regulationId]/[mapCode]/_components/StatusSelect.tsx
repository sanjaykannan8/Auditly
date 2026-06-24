'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const STATUSES = ['pending', 'in_progress', 'submitted', 'approved', 'rejected', 'overdue']
const LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  overdue: 'Overdue',
}

export default function StatusSelect({
  regulationId,
  mapCode,
  current,
  token,
}: {
  regulationId: string
  mapCode: string
  current: string
  token: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState(current)
  const [saving, setSaving] = useState(false)

  async function change(next: string) {
    const prev = status
    setStatus(next)
    setSaving(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/maps/${regulationId}/${mapCode}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: next }),
        },
      )
      if (!res.ok) throw new Error('failed')
      router.refresh()
    } catch {
      setStatus(prev)
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={status}
      disabled={saving}
      onChange={(e) => change(e.target.value)}
      className="w-full text-sm font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/20 disabled:opacity-60"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>{LABEL[s]}</option>
      ))}
    </select>
  )
}
