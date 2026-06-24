'use client'

import { useAuth } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Notice = { title: string; count: number }

export default function RealtimeNotifier({
  userId,
  orgId,
}: {
  userId: string
  orgId: string
}) {
  const { getToken } = useAuth()
  const router = useRouter()
  const [notice, setNotice] = useState<Notice | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let active = true
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    async function connect() {
      if (!active) return
      const token = await getToken()
      if (!token || !active) return

      const base = (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').replace(/^http/, 'ws')
      const ws = new WebSocket(`${base}/ws/${userId}?org_id=${orgId}&token=${token}`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'regulation.processed') {
            setNotice({ title: msg.title, count: msg.maps_count })
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('New regulation processed', {
                body: `${msg.title} — ${msg.maps_count} MAP${msg.maps_count !== 1 ? 's' : ''} generated`,
                icon: '/dash.png',
              })
            }
          }
        } catch {
          /* ignore malformed frames */
        }
      }

      ws.onclose = () => {
        if (active) reconnectTimer = setTimeout(connect, 5000)
      }
      ws.onerror = () => ws.close()
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    connect()

    return () => {
      active = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [userId, orgId, getToken])

  function reload() {
    setNotice(null)
    router.refresh()
  }

  if (!notice) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#ff5d03]/10 flex items-center justify-center flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#ff5d03] animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">New regulation processed</p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notice.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {notice.count} MAP{notice.count !== 1 ? 's' : ''} generated
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={reload}
              className="text-xs font-semibold text-white bg-[#ff5d03] hover:bg-[#e04f02] px-3 py-1.5 rounded-lg transition-colors"
            >
              Reload to view
            </button>
            <button
              onClick={() => setNotice(null)}
              className="text-xs font-medium text-gray-400 hover:text-gray-600 px-2 py-1.5"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
