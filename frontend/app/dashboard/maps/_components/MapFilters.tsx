'use client'

import { useRouter } from 'next/navigation'

type Option = { id: string; name: string }

export default function MapFilters({
  departments,
  regulations,
  currentDept,
  currentReg,
  tab,
}: {
  departments: Option[]
  regulations: Option[]
  currentDept?: string
  currentReg?: string
  tab: string
}) {
  const router = useRouter()

  function go(next: { dept?: string; reg?: string }) {
    const dept = 'dept' in next ? next.dept : currentDept
    const reg = 'reg' in next ? next.reg : currentReg
    const params = new URLSearchParams()
    params.set('tab', tab)
    if (dept) params.set('dept', dept)
    if (reg) params.set('reg', reg)
    router.push(`/dashboard/maps?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={currentDept ?? ''}
        onChange={(e) => go({ dept: e.target.value })}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/20"
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>

      <select
        value={currentReg ?? ''}
        onChange={(e) => go({ reg: e.target.value })}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/20 max-w-[220px]"
      >
        <option value="">All regulations</option>
        {regulations.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
    </div>
  )
}
