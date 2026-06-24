'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function OrgNameForm({
  initialName,
  token,
  canEdit,
}: {
  initialName: string
  token: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = name.trim() !== initialName && name.trim().length > 0

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/org`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail ?? 'Update failed')
      }
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/30 focus:border-[#ff5d03] disabled:bg-gray-50 disabled:text-gray-400"
        />
        {canEdit && (
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-2.5 rounded-lg bg-[#ff5d03] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#e04f02] transition-colors whitespace-nowrap"
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      {!canEdit && <p className="text-xs text-gray-400 mt-1.5">Only the compliance officer can edit this.</p>}
    </div>
  )
}
