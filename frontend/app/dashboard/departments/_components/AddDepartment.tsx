'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function AddDepartment({ token }: { token: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), objective: objective.trim() }),
      })
      if (!res.ok) {
        const e2 = await res.json().catch(() => ({}))
        throw new Error(typeof e2.detail === 'string' ? e2.detail : 'Failed to add department')
      }
      setName('')
      setObjective('')
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-[#ff5d03] hover:bg-[#e04f02] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Add Department
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setOpen(false)}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white rounded-2xl border border-gray-200 shadow-lg w-full max-w-md p-6 space-y-4"
      >
        <h2 className="text-base font-semibold text-gray-900">New Department</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Treasury Operations"
            autoFocus
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/30 focus:border-[#ff5d03]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Objective</label>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="What this department is responsible for (used by the AI to assign action items)"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/30 focus:border-[#ff5d03]"
          />
          <p className="text-xs text-gray-400 mt-1">This objective is fed to the AI so future regulations can route action items here.</p>
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-[#ff5d03] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e04f02] transition-colors"
          >
            {saving ? 'Adding...' : 'Add Department'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
