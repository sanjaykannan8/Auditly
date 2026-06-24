'use client'

import { useAuth } from '@/lib/auth-client'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export default function ProfilePage() {
  const { user, setUser, getToken, logout } = useAuth()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [pfpFile, setPfpFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (user) {
      setUsername(user.username)
      setEmail(user.email)
      setPreview(user.pfp_url)
    }
  }, [user])

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
    <div className="min-h-screen bg-gray-50">
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <Image src="/dash.png" alt="Auditly" width={32} height={32} className="object-contain" />
          <span className="text-xl font-bold text-gray-900 tracking-tight">Auditly</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back
          </button>
          <button onClick={logout} className="text-sm font-medium text-red-600 hover:text-red-700">
            Sign out
          </button>
        </div>
      </header>

      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-gray-500 mt-1 text-sm">Manage your account details and profile picture.</p>
        </div>

        <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div className="flex items-center gap-5">
            <div
              className="w-20 h-20 rounded-full overflow-hidden bg-[#ff5d03]/10 flex items-center justify-center cursor-pointer ring-1 ring-gray-100 hover:ring-[#ff5d03]/40 transition-all"
              onClick={() => fileRef.current?.click()}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-[#ff5d03]">{initial}</span>
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
            className="py-2.5 px-5 rounded-lg bg-[#ff5d03] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e04f02] transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save changes'}
          </button>
        </form>

        {/* Security */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
          <h2 className="text-sm font-semibold text-gray-700">Security</h2>
          <p className="text-xs text-gray-400 mt-1 mb-4">
            Reset your password to the default <span className="font-mono text-gray-600">welcome@123</span>.
            Use it to sign in next time, then change it.
          </p>
          <button
            type="button"
            onClick={resetPassword}
            disabled={resetting}
            className="py-2.5 px-5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {resetting ? 'Resetting...' : resetDone ? 'Password reset ✓' : 'Reset password to welcome@123'}
          </button>
          {resetDone && (
            <p className="text-xs text-green-700 mt-2">
              Your password is now <span className="font-mono">welcome@123</span>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
