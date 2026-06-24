'use client'

import Link from 'next/link'
import { useState } from 'react'

type Action = {
  regulation_id: string
  map_code: string
  title: string
  department: string
  priority: string | null
  deadline: string | null
  status: string
}

function daysAgo(dateStr: string): number | null {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function contextLine(a: Action): string {
  const dept = a.department || 'The department'
  const dl = a.deadline ? daysAgo(a.deadline) : null
  switch (a.status) {
    case 'submitted':
      return `${dept} submitted proof — pending your review.`
    case 'overdue':
      return dl !== null && dl > 0
        ? `${dept} has not responded. Deadline passed ${dl} day${dl !== 1 ? 's' : ''} ago.`
        : `${dept} is overdue.`
    case 'rejected':
      return `${dept}'s submission was rejected — awaiting resubmission.`
    case 'in_progress':
      return a.deadline ? `${dept} is working on it — due ${a.deadline}.` : `${dept} is working on it.`
    default:
      return a.deadline ? `Not started by ${dept} — due ${a.deadline}.` : `Awaiting action from ${dept}.`
  }
}

const priorityDot: Record<string, string> = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-green-500',
}

export default function PriorityActions({
  actions,
  token,
}: {
  actions: Action[]
  token: string
}) {
  const [reminded, setReminded] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function remind(a: Action) {
    const key = `${a.regulation_id}-${a.map_code}`
    setBusy(key)
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/maps/${a.regulation_id}/${a.map_code}/remind`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      )
      setReminded((r) => ({ ...r, [key]: true }))
    } finally {
      setBusy(null)
    }
  }

  if (actions.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-400">Nothing on fire. All action items are on track.</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-50">
      {actions.map((a) => {
        const key = `${a.regulation_id}-${a.map_code}`
        const isReview = a.status === 'submitted'
        return (
          <div key={key} className="flex items-center gap-4 px-6 py-4">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot[a.priority ?? ''] ?? 'bg-gray-300'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{contextLine(a)}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isReview ? (
                <Link
                  href={`/dashboard/maps/${a.regulation_id}/${a.map_code}`}
                  className="text-xs font-semibold text-white bg-[#ff5d03] hover:bg-[#e04f02] px-3 py-1.5 rounded-lg transition-colors"
                >
                  Review submission
                </Link>
              ) : (
                <>
                  <button
                    onClick={() => remind(a)}
                    disabled={busy === key || reminded[key]}
                    className="text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {reminded[key] ? 'Reminded ✓' : busy === key ? 'Sending…' : `Remind ${a.department.split(' ')[0]}`}
                  </button>
                  <Link
                    href={`/dashboard/maps/${a.regulation_id}/${a.map_code}`}
                    className="text-xs font-medium text-[#ff5d03] hover:text-[#e04f02] px-2 py-1.5"
                  >
                    Open
                  </Link>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
