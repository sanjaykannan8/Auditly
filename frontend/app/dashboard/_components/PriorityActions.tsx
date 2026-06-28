'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { gsap } from '@/lib/gsap'

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

const urgencyBadge: Record<string, { bg: string; icon: React.ReactNode }> = {
  overdue: { bg: 'bg-red-50', icon: <ClockGlyph color="#dc2626" /> },
  submitted: { bg: 'bg-purple-50', icon: <EyeGlyph color="#7e22ce" /> },
  rejected: { bg: 'bg-red-50', icon: <ClockGlyph color="#dc2626" /> },
  in_progress: { bg: 'bg-blue-50', icon: <ClockGlyph color="#2563eb" /> },
}

function ClockGlyph({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <path d="M12 7V12L15.5 14" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EyeGlyph({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M2 12C2 12 5.5 5.5 12 5.5C18.5 5.5 22 12 22 12C22 12 18.5 18.5 12 18.5C5.5 18.5 2 12 2 12Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.8" stroke={color} strokeWidth="1.8" />
    </svg>
  )
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
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const rows = el.querySelectorAll('[data-action-row]')
    if (!rows.length) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        rows,
        { opacity: 0, x: 14 },
        {
          opacity: 1,
          x: 0,
          duration: 0.35,
          ease: 'power2.out',
          stagger: 0.055,
          delay: 0.35,
          clearProps: 'all',
        },
      )
    }, el)

    return () => ctx.revert()
  }, [actions.length])

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
    <div ref={listRef} className="divide-y divide-gray-50">
      {actions.map((a) => {
        const key = `${a.regulation_id}-${a.map_code}`
        const isReview = a.status === 'submitted'
        const badge = urgencyBadge[a.status] ?? { bg: 'bg-gray-100', icon: <ClockGlyph color="#9ca3af" /> }
        return (
          <div data-action-row key={key} className="flex items-center gap-3.5 px-6 py-4 hover:bg-gray-50/60 transition-colors">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${badge.bg}`}>
              {badge.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{contextLine(a)}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isReview ? (
                <Link
                  href={`/dashboard/maps/${a.regulation_id}/${a.map_code}`}
                  className="text-xs font-semibold text-white bg-[#ff5d03] hover:bg-[#e04f02] active:scale-[0.97] px-3 py-1.5 rounded-lg transition-all"
                >
                  Review submission
                </Link>
              ) : (
                <>
                  <button
                    onClick={() => remind(a)}
                    disabled={busy === key || reminded[key]}
                    className="text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 active:scale-[0.97] px-3 py-1.5 rounded-lg transition-all disabled:opacity-60 disabled:active:scale-100"
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
