'use client'

import { useRouter } from 'next/navigation'

/**
 * Uses browser history instead of a fixed Link — a plain Link to /dashboard/maps
 * always reset the tab/department/regulation filters the officer had open.
 */
export default function BackButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6 transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back to action items
    </button>
  )
}
