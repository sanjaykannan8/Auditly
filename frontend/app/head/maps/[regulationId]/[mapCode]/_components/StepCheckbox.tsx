'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

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

  async function toggle() {
    if (disabled || loading) return
    const next = !checked
    setChecked(next)
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
      setChecked(!next) // revert optimistic toggle
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || loading}
      className="flex items-start gap-3 w-full text-left group disabled:cursor-default"
    >
      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
        checked
          ? 'bg-green-500 border-green-500'
          : 'border-gray-300 group-hover:border-gray-400'
      } ${loading ? 'opacity-50' : ''}`}>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <p className={`text-sm transition-colors ${checked ? 'line-through text-gray-400' : 'text-gray-700 group-hover:text-gray-900'}`}>
        <span className="text-gray-400 text-xs mr-1">{stepNum}.</span>
        {description}
      </p>
    </button>
  )
}
