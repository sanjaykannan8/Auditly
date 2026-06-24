import { cookies } from 'next/headers'

export type AuthUser = {
  id: string
  username: string
  email: string
  pfp_url: string | null
}

export const TOKEN_COOKIE = 'auditly_token'
export const USER_COOKIE = 'auditly_user'

/** Read the access token from the request cookies (server components / route handlers). */
export async function getServerToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(TOKEN_COOKIE)?.value ?? null
}

/** Read the cached user profile from cookies for display (greeting, header). */
export async function getServerUser(): Promise<AuthUser | null> {
  const store = await cookies()
  const raw = store.get(USER_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw)) as AuthUser
  } catch {
    return null
  }
}
