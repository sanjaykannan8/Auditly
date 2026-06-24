'use client'

import { useState } from 'react'

export default function InviteButton({
  deptId,
  deptName,
  token,
}: {
  deptId: string
  deptName: string
  token: string
}) {
  const [loading, setLoading] = useState(false)
  const [token_str, setTokenStr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/departments/${deptId}/generate-invite`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail ?? 'Failed to generate invite')
      }
      const data = await res.json()
      setTokenStr(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!token_str) return
    await navigator.clipboard.writeText(token_str)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (token_str) {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs text-gray-500">Share this token with your {deptName} head:</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={token_str}
            className="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 min-w-0 truncate"
          />
          <button
            onClick={copy}
            className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors flex-shrink-0 ${
              copied
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button onClick={() => setTokenStr(null)} className="text-xs text-gray-400 hover:text-gray-600">
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3">
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        onClick={generate}
        disabled={loading}
        className="text-xs font-semibold text-[#ff5d03] border border-[#ff5d03]/30 hover:border-[#ff5d03]/60 hover:bg-[#ff5d03]/5 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? 'Generating…' : 'Generate Invite'}
      </button>
    </div>
  )
}
