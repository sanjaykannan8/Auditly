'use client'

import { useState } from 'react'

export default function RemindButton({
  deptId,
  token,
}: {
  deptId: string
  token: string
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function remind() {
    setState('sending')
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/departments/${deptId}/remind`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      )
      setState('sent')
      setTimeout(() => setState('idle'), 2500)
    } catch {
      setState('idle')
    }
  }

  return (
    <button
      onClick={remind}
      disabled={state !== 'idle'}
      className="w-full text-xs font-semibold text-[#ff5d03] border border-[#ff5d03]/30 hover:border-[#ff5d03]/60 hover:bg-[#ff5d03]/5 px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
    >
      {state === 'sent' ? 'Reminder sent ✓' : state === 'sending' ? 'Sending…' : 'Send Reminder'}
    </button>
  )
}
