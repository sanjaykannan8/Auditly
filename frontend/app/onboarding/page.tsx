'use client'

import { useAuth } from '@/lib/auth-client'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

const DEFAULT_DEPARTMENTS = [
  { name: 'IT & Cybersecurity',   objective: 'Digital infrastructure, 2FA, system security, data protection' },
  { name: 'Legal & Compliance',   objective: 'Regulatory interpretation, policy updates, RBI liaison' },
  { name: 'Risk Management',      objective: 'Credit/market/operational risk, Basel III, stress testing' },
  { name: 'Operations',           objective: 'KYC/AML, payment systems, branch ops, customer-facing changes' },
  { name: 'Finance & Treasury',   objective: 'Capital adequacy, liquidity, FEMA/forex compliance' },
  { name: 'Audit & Inspection',   objective: 'Internal audit, inspection readiness, audit trail maintenance' },
  { name: 'HR & Training',        objective: 'Staff awareness, policy dissemination, certification tracking' },
]

type Dept = { name: string; objective: string }
type Mode = 'choose' | 'create' | 'join'
type CreateStep = 'org' | 'depts'

export default function OnboardingPage() {
  const { getToken } = useAuth()
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('choose')

  // ── Create-org flow ──
  const [createStep, setCreateStep] = useState<CreateStep>('org')
  const [bankName, setBankName] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [departments, setDepartments] = useState<Dept[]>(DEFAULT_DEPARTMENTS)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Join-org flow ──
  const [inviteToken, setInviteToken] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setCreateError(null)

    try {
      const token = await getToken()
      if (!token) throw new Error('No auth token — please refresh')

      let logoBase64: string | null = null
      if (logoFile) {
        logoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(logoFile)
        })
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/onboarding/create-org`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: bankName.trim(),
            logo_base64: logoBase64,
            departments: departments.filter((d) => d.name.trim()),
          }),
        },
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? `Failed (${res.status})`)
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleJoinOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteToken.trim()) return
    setJoining(true)
    setJoinError(null)

    try {
      const token = await getToken()
      if (!token) throw new Error('No auth token — please refresh')

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/onboarding/join-org`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ invitation_token: inviteToken.trim() }),
        },
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? `Failed (${res.status})`)
      }

      router.push('/head/maps')
      router.refresh()
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setJoining(false)
    }
  }

  function updateDept(index: number, field: keyof Dept, value: string) {
    setDepartments((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 pb-16 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Image src="/dash.png" alt="Auditly" width={32} height={32} className="object-contain" />
            <span className="text-xl font-bold text-gray-900">Auditly</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Auditly</h1>
          <p className="text-gray-500 text-sm mt-1">
            {mode === 'choose' && 'Set up your workspace or join an existing one'}
            {mode === 'create' && (createStep === 'org' ? 'Tell us about your bank' : 'Configure your departments')}
            {mode === 'join' && 'Paste your invitation token to join'}
          </p>
        </div>

        {/* ── Mode chooser ──────────────────────────────────────────── */}
        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full bg-white border border-gray-200 rounded-2xl p-5 text-left hover:border-[#ff5d03]/40 hover:shadow-sm transition-all"
            >
              <p className="text-sm font-semibold text-gray-900">I'm a Compliance Officer</p>
              <p className="text-xs text-gray-500 mt-0.5">Create your bank's workspace and invite department heads</p>
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full bg-white border border-gray-200 rounded-2xl p-5 text-left hover:border-blue-400/40 hover:shadow-sm transition-all"
            >
              <p className="text-sm font-semibold text-gray-900">I'm a Department Head</p>
              <p className="text-xs text-gray-500 mt-0.5">Join using the invitation token sent by your compliance officer</p>
            </button>
          </div>
        )}

        {/* ── Create: Step 1 (bank info) ────────────────────────────── */}
        {mode === 'create' && createStep === 'org' && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (bankName.trim()) setCreateStep('depts') }}
            className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Bank Logo</label>
              <div
                className="flex items-center gap-4 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 hover:border-gray-300 transition-colors">
                  {logoPreview ? (
                    <img src={logoPreview} alt="logo preview" className="w-full h-full object-contain p-1" />
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V15" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M17 8L12 3L7 8" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 3V15" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600">{logoFile ? logoFile.name : 'Upload your bank logo'}</p>
                  <p className="text-xs text-gray-400">PNG, JPG up to 2MB (optional)</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank Name</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. State Bank of India"
                required
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/30 focus:border-[#ff5d03]"
              />
            </div>

            <button
              type="submit"
              disabled={!bankName.trim()}
              className="w-full py-2.5 rounded-lg bg-[#ff5d03] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e04f02] transition-colors"
            >
              Continue →
            </button>
            <button type="button" onClick={() => setMode('choose')} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600">
              ← Back
            </button>
          </form>
        )}

        {/* ── Create: Step 2 (departments) ─────────────────────────── */}
        {mode === 'create' && createStep === 'depts' && (
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Departments</h2>
                <button
                  type="button"
                  onClick={() => setDepartments((p) => [...p, { name: '', objective: '' }])}
                  className="text-xs text-[#ff5d03] font-medium hover:text-[#e04f02]"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {departments.map((dept, i) => (
                  <div key={i} className="group rounded-lg border border-gray-100 p-3 hover:border-gray-200 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <input
                        type="text"
                        value={dept.name}
                        onChange={(e) => updateDept(i, 'name', e.target.value)}
                        placeholder="Department name"
                        className="flex-1 text-sm font-medium bg-transparent border-none focus:outline-none placeholder:text-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => setDepartments((p) => p.filter((_, j) => j !== i))}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      type="text"
                      value={dept.objective}
                      onChange={(e) => updateDept(i, 'objective', e.target.value)}
                      placeholder="Objective (optional)"
                      className="w-full text-xs text-gray-500 bg-transparent border-none focus:outline-none placeholder:text-gray-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            {createError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{createError}</p>}

            <button
              type="submit"
              disabled={saving || departments.filter((d) => d.name.trim()).length === 0}
              className="w-full py-2.5 rounded-lg bg-[#ff5d03] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e04f02] transition-colors"
            >
              {saving ? 'Setting up…' : 'Launch Auditly →'}
            </button>
            <button type="button" onClick={() => setCreateStep('org')} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600">
              ← Back
            </button>
          </form>
        )}

        {/* ── Join org (dept head) ──────────────────────────────────── */}
        {mode === 'join' && (
          <form onSubmit={handleJoinOrg} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Invitation Token</label>
              <textarea
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                rows={4}
                placeholder="Paste the invitation token sent by your compliance officer"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              />
            </div>

            {joinError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{joinError}</p>}

            <button
              type="submit"
              disabled={joining || !inviteToken.trim()}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              {joining ? 'Joining…' : 'Join organization →'}
            </button>
            <button type="button" onClick={() => setMode('choose')} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600">
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
