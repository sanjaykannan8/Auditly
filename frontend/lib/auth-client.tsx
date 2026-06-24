'use client'

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type AuthUser = {
  id: string
  username: string
  email: string
  pfp_url: string | null
}

const TOKEN_COOKIE = 'auditly_token'
const USER_COOKIE = 'auditly_user'
const MAX_AGE = 7 * 24 * 60 * 60 // 7 days, matches backend token TTL

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? ''

// ── cookie helpers ──
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; SameSite=Lax`
}
function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
}
function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

type AuthContextValue = {
  token: string | null
  user: AuthUser | null
  loading: boolean
  login: (identifier: string, password: string) => Promise<void>
  signup: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (u: AuthUser) => void
  getToken: () => string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // hydrate from cookies on mount
  useEffect(() => {
    setToken(readCookie(TOKEN_COOKIE))
    const u = readCookie(USER_COOKIE)
    if (u) {
      try { setUserState(JSON.parse(u)) } catch { /* ignore */ }
    }
    setLoading(false)
  }, [])

  function persist(tok: string, u: AuthUser) {
    setCookie(TOKEN_COOKIE, tok)
    setCookie(USER_COOKIE, JSON.stringify(u))
    setToken(tok)
    setUserState(u)
  }

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await fetch(`${BACKEND}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e.detail ?? 'Login failed')
    }
    const data = await res.json()
    persist(data.token, data.user)
  }, [])

  const signup = useCallback(async (username: string, email: string, password: string) => {
    const res = await fetch(`${BACKEND}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      const detail = typeof e.detail === 'string' ? e.detail : 'Signup failed'
      throw new Error(detail)
    }
    const data = await res.json()
    persist(data.token, data.user)
  }, [])

  const logout = useCallback(() => {
    deleteCookie(TOKEN_COOKIE)
    deleteCookie(USER_COOKIE)
    setToken(null)
    setUserState(null)
    router.push('/sign-in')
    router.refresh()
  }, [router])

  const setUser = useCallback((u: AuthUser) => {
    setCookie(USER_COOKIE, JSON.stringify(u))
    setUserState(u)
  }, [])

  const getToken = useCallback(() => readCookie(TOKEN_COOKIE), [])

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, loading, login, signup, logout, setUser, getToken }),
    [token, user, loading, login, signup, logout, setUser, getToken],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
