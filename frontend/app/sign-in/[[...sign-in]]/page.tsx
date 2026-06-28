'use client'

import { useAuth } from '@/lib/auth-client'
import { Globe } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { CardReveal, PillarReveal } from './_components/SignInAnimations'

const LEFT_PILLARS = [
  { h: '85vh', w: '11vw', l: '-1vw', op: 0.95, z: 10 },
  { h: '70vh', w: '10vw', l: '8vw',  op: 0.80, z: 20 },
  { h: '55vh', w: '9vw',  l: '16vw', op: 0.65, z: 30 },
  { h: '40vh', w: '8vw',  l: '23vw', op: 0.50, z: 40 },
  { h: '25vh', w: '7vw',  l: '29vw', op: 0.35, z: 50 },
]
const RIGHT_PILLARS = [
  { h: '85vh', w: '11vw', r: '-1vw', op: 0.95, z: 10 },
  { h: '70vh', w: '10vw', r: '8vw',  op: 0.80, z: 20 },
  { h: '55vh', w: '9vw',  r: '16vw', op: 0.65, z: 30 },
  { h: '40vh', w: '8vw',  r: '23vw', op: 0.50, z: 40 },
  { h: '25vh', w: '7vw',  r: '29vw', op: 0.35, z: 50 },
]

function CityScapeBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {LEFT_PILLARS.map((p, i) => (
        <div key={`l-${i}`} data-pillar className="absolute bottom-0" style={{ height: p.h, width: p.w, left: p.l, zIndex: p.z }}>
          <div className="absolute top-0 bottom-0 -left-6 -right-6" style={{ background: '#ff5d03', filter: 'blur(45px)', opacity: p.op * 0.9 }} />
          <div className="absolute inset-0 rounded-t-sm" style={{ background: '#ff5d03', opacity: p.op }} />
        </div>
      ))}
      {RIGHT_PILLARS.map((p, i) => (
        <div key={`r-${i}`} data-pillar className="absolute bottom-0" style={{ height: p.h, width: p.w, right: p.r, zIndex: p.z }}>
          <div className="absolute top-0 bottom-0 -left-6 -right-6" style={{ background: '#ff5d03', filter: 'blur(45px)', opacity: p.op * 0.9 }} />
          <div className="absolute inset-0 rounded-t-sm" style={{ background: '#ff5d03', opacity: p.op }} />
        </div>
      ))}
      <div className="absolute inset-0 z-[60]" style={{
        background: 'radial-gradient(ellipse 65% 80% at 50% 50%, rgba(255,255,255,1) 15%, rgba(255,255,255,0.7) 40%, rgba(255,255,255,0) 100%)',
      }} />
    </div>
  )
}

export default function SignInPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(identifier.trim(), password)
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden text-gray-900"
      style={{ backgroundImage: "url('/bg.svg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
    >
      <CityScapeBackground />
      {/* Animate pillars rising on load */}
      <PillarReveal selector="[data-pillar]" />

      <header className="relative z-[100] flex justify-between items-center px-8 py-6 w-full">
        <Link href="/sign-in" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dash.png" alt="Auditly" className="w-8 h-8 object-contain" />
          <span className="text-2xl font-bold text-gray-900 tracking-tight">Auditly</span>
        </Link>
        <div className="flex items-center gap-2 text-gray-700 font-medium text-sm select-none">
          <Globe className="w-4 h-4" />
          <span>English</span>
        </div>
      </header>

      <div className="relative z-[100] flex-1 flex items-center justify-center w-full max-w-[440px] mx-auto px-4 pb-20">
        <div className="w-full">
          {/* Animate card in after pillars */}
          <CardReveal cardRef={cardRef} />
          <div ref={cardRef} className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-gray-100 px-8 py-9">
            <div className="flex flex-col items-center text-center mb-7">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/dash.png" alt="Auditly" className="w-11 h-11 object-contain mb-4" />
              <h1 className="text-[22px] font-bold text-gray-900">Sign in to Auditly</h1>
              <p className="text-[15px] text-gray-500 mt-1">Welcome back! Please sign in to continue</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Email address or username</label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter email or username"
                  autoComplete="username"
                  required
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/30 focus:border-[#ff5d03]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/30 focus:border-[#ff5d03]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

              <button
                type="submit"
                disabled={loading || !identifier.trim() || !password}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#ff5d03] text-white text-[15px] font-semibold disabled:opacity-50 hover:bg-[#e04f02] transition-colors"
              >
                {loading ? 'Signing in...' : 'Continue'}
                {!loading && <span aria-hidden>&rsaquo;</span>}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-gray-600 mt-5">
            Don&apos;t have an account?{' '}
            <Link href="/sign-up" className="font-semibold text-[#ff5d03] hover:text-[#e04f02]">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M2 12s3.5-7 10-7c2.2 0 4.1.8 5.7 1.9M22 12s-3.5 7-10 7c-2.2 0-4.1-.8-5.7-1.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
