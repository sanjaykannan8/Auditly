'use client'

import { useAuth } from '@/lib/auth-client'
import { useEffect, useRef, useState } from 'react'

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, setUser, getToken } = useAuth()
  const [username, setUsername] = useState(user?.username ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [pfpFile, setPfpFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(user?.pfp_url ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function resetPassword() {
    if (!confirm('Reset your password to "welcome@123"?')) return
    setResetting(true)
    setResetDone(false)
    setError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ new_password: 'welcome@123' }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(typeof e.detail === 'string' ? e.detail : 'Reset failed')
      }
      setResetDone(true)
      setTimeout(() => setResetDone(false), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPfpFile(f)
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(f)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const token = getToken()
      const body: Record<string, string> = {}
      if (username.trim() && username.trim() !== user?.username) body.username = username.trim()
      if (email.trim() && email.trim() !== user?.email) body.email = email.trim()
      if (pfpFile) {
        body.pfp_base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(pfpFile)
        })
      }
      if (Object.keys(body).length === 0) { setSaving(false); return }

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const e2 = await res.json().catch(() => ({}))
        throw new Error(typeof e2.detail === 'string' ? e2.detail : 'Update failed')
      }
      const updated = await res.json()
      setUser(updated)
      setPfpFile(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const initial = (username || '?').charAt(0).toUpperCase()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (!cardRef.current?.contains(e.target as Node)) onClose() }}
    >
      <div
        ref={cardRef}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h1 className="text-base font-semibold text-gray-900">Profile</h1>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={save} className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full overflow-hidden bg-[#ff5d03]/10 flex items-center justify-center cursor-pointer ring-1 ring-gray-100 hover:ring-[#ff5d03]/40 transition-all flex-shrink-0"
              onClick={() => fileRef.current?.click()}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-[#ff5d03]">{initial}</span>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-sm font-medium text-[#ff5d03] hover:text-[#e04f02] border border-[#ff5d03]/30 rounded-lg px-3 py-1.5"
              >
                Change picture
              </button>
              <p className="text-xs text-gray-400 mt-1.5">PNG or JPG, square works best.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/30 focus:border-[#ff5d03]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/30 focus:border-[#ff5d03]"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-[#ff5d03] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e04f02] active:scale-[0.99] transition-all"
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save changes'}
          </button>

          <div className="pt-5 border-t border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Security</h2>
            <p className="text-xs text-gray-400 mt-1 mb-3">
              Reset your password to the default <span className="font-mono text-gray-600">welcome@123</span>.
              Use it to sign in next time, then change it.
            </p>
            <button
              type="button"
              onClick={resetPassword}
              disabled={resetting}
              className="w-full py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.99] disabled:opacity-50 transition-all"
            >
              {resetting ? 'Resetting...' : resetDone ? 'Password reset ✓' : 'Reset password to welcome@123'}
            </button>
            {resetDone && (
              <p className="text-xs text-green-700 mt-2">
                Your password is now <span className="font-mono">welcome@123</span>.
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
