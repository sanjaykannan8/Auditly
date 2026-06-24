'use client'

import ProfileModal from '@/app/_components/ProfileModal'
import { useAuth } from '@/lib/auth-client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export default function HeaderActions() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const initial = (user?.username ?? '?').charAt(0).toUpperCase()

  return (
    <div className="flex items-center gap-1">
      <button className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors">
        <BellIcon />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full" />
      </button>

      <div className="w-px h-5 bg-gray-200 mx-1" />

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden bg-[#ff5d03]/10 hover:ring-2 hover:ring-[#ff5d03]/30 transition-all"
        >
          {user?.pfp_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.pfp_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-[#ff5d03]">{initial}</span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.username ?? 'Account'}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => { setOpen(false); setProfileOpen(true) }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Profile settings
            </button>
            <Link
              href="/dashboard/settings"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Organization settings
            </Link>
            <button
              onClick={() => { setOpen(false); logout() }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15 17H20L18.5951 15.5951C18.2141 15.2141 18 14.6973 18 14.1585V11C18 8.38757 16.3304 6.16509 14 5.34142V5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5V5.34142C7.66962 6.16509 6 8.38757 6 11V14.1585C6 14.6973 5.78595 15.2141 5.40493 15.5951L4 17H9M15 17H9M15 17C15 18.6569 13.6569 20 12 20C10.3431 20 9 18.6569 9 17"
        stroke="#ea580c"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
