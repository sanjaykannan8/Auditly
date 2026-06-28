'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { gsap } from '@/lib/gsap'

export default function StepCheckbox({
  regulationId,
  mapCode,
  stepNum,
  completed,
  description,
  token,
  disabled,
}: {
  regulationId: string
  mapCode: string
  stepNum: number
  completed: boolean
  description: string
  token: string
  disabled: boolean
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(completed)
  const [loading, setLoading] = useState(false)
  const circleRef = useRef<HTMLDivElement>(null)

  async function toggle() {
    if (disabled || loading) return
    const next = !checked
    setChecked(next)

    // Micro-animation on the circle
    if (circleRef.current) {
      gsap.fromTo(
        circleRef.current,
        { scale: 0.75 },
        { scale: 1, duration: 0.3, ease: 'back.out(2.5)' },
      )
    }

    setLoading(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/head/maps/${regulationId}/${mapCode}/steps/${stepNum}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ completed: next }),
        },
      )
      if (!res.ok) throw new Error('failed')
      router.refresh()
    } catch {
      setChecked(!next)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      data-step-item
      type="button"
      onClick={toggle}
      disabled={disabled || loading}
      className="flex items-start gap-3 w-full text-left py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors group disabled:cursor-default"
    >
      {/* Custom checkbox */}
      <div
        ref={circleRef}
        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-200 ${
          checked
            ? 'bg-green-500 border-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.15)]'
            : disabled
            ? 'border-gray-200'
            : 'border-gray-300 group-hover:border-[#ff5d03] group-hover:shadow-[0_0_0_3px_rgba(255,93,3,0.1)]'
        } ${loading ? 'opacity-60' : ''}`}
      >
        {loading ? (
          <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin" />
        ) : checked ? (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </div>

      {/* Step text */}
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold text-gray-400 mr-1.5">{stepNum}.</span>
        <span className={`text-sm transition-colors ${
          checked ? 'line-through text-gray-400' : 'text-gray-700 group-hover:text-gray-900'
        }`}>
          {description}
        </span>
      </div>
    </button>
  )
}
