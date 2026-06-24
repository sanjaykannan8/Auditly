'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV_ITEMS = [
  { label: 'Home',         href: '/dashboard',             icon: HomeIcon        },
  { label: 'Action Items', href: '/dashboard/maps',        icon: MapsIcon        },
  { label: 'Regulations',  href: '/dashboard/regulations', icon: RegulationsIcon },
  { label: 'Departments',  href: '/dashboard/departments', icon: DepartmentsIcon },
  { label: 'Audit trail',  href: '/dashboard/audit-trail', icon: AuditTrailIcon  },
  { label: 'Org settings', href: '/dashboard/settings',    icon: SettingsIcon    },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className="flex flex-col bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-200"
      style={{ width: collapsed ? '64px' : '220px' }}
    >
      <nav className="flex-1 py-3 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-colors
                ${collapsed ? 'justify-center px-2' : 'px-3 justify-between'}
                ${isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <span className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                <Icon active={isActive} />
                {!collapsed && item.label}
              </span>
              {!collapsed && <ChevronRight active={isActive} />}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          {collapsed ? <ExpandIcon /> : <CollapseIcon />}
        </button>
      </div>
    </aside>
  )
}

/* ─── Icons ─── */

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V9.5Z"
        stroke={active ? '#ff5d03' : '#6b7280'}
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        fill={active ? 'rgba(255,93,3,0.1)' : 'none'}
      />
    </svg>
  )
}

function MapsIcon({ active }: { active: boolean }) {
  const c = active ? '#ff5d03' : '#6b7280'
  const f = active ? 'rgba(255,93,3,0.1)' : 'none'
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3"  y="3"  width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.8" fill={f} />
      <rect x="14" y="3"  width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.8" fill={f} />
      <rect x="3"  y="14" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.8" fill={f} />
      <circle cx="17.5" cy="17.5" r="3.5" stroke={c} strokeWidth="1.8" fill={f} />
    </svg>
  )
}

function RegulationsIcon({ active }: { active: boolean }) {
  const c = active ? '#ff5d03' : '#6b7280'
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 3H17C18.1046 3 19 3.89543 19 5V19C19 20.1046 18.1046 21 17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3Z"
        stroke={c} strokeWidth="1.8" fill={active ? 'rgba(255,93,3,0.08)' : 'none'}
      />
      <path d="M9 8H15" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 12H15" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 16H12" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function DepartmentsIcon({ active }: { active: boolean }) {
  const c = active ? '#ff5d03' : '#6b7280'
  const f = active ? 'rgba(255,93,3,0.1)' : 'none'
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="9"  y="2"  width="6" height="5" rx="1" stroke={c} strokeWidth="1.8" fill={f} />
      <rect x="2"  y="13" width="6" height="5" rx="1" stroke={c} strokeWidth="1.8" fill={f} />
      <rect x="16" y="13" width="6" height="5" rx="1" stroke={c} strokeWidth="1.8" fill={f} />
      <path d="M12 7V10M12 10H6V13M12 10H18V13" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function AuditTrailIcon({ active }: { active: boolean }) {
  const c = active ? '#ff5d03' : '#6b7280'
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15"
        stroke={c} strokeWidth="1.8" fill={active ? 'rgba(255,93,3,0.06)' : 'none'}
      />
      <path
        d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V6H9V5Z"
        stroke={c} strokeWidth="1.8" fill={active ? 'rgba(255,93,3,0.1)' : 'none'}
      />
      <path d="M9 12L11 14L15 10" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SettingsIcon({ active }: { active: boolean }) {
  const c = active ? '#ff5d03' : '#6b7280'
  const f = active ? 'rgba(255,93,3,0.1)' : 'none'
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.8" fill={f} />
      <path
        d="M12 2L13.5 4.5L16.5 4L17 7L19.5 8L18.5 11L20 13L18 15L18.5 18L15.5 18L14 20.5L12 19.5L10 20.5L8.5 18L5.5 18L6 15L4 13L5.5 11L4.5 8L7 7L7.5 4L10.5 4.5L12 2Z"
        stroke={c} strokeWidth="1.4" strokeLinejoin="round"
        transform="scale(0.85) translate(2.1 2.1)"
      />
    </svg>
  )
}

function ChevronRight({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 18L15 12L9 6"
        stroke={active ? '#ff5d03' : '#9ca3af'}
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

function CollapseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 3V21" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 12L3 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 3V21" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13 12L16 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
