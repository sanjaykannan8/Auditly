'use client'

import { useRouter } from 'next/navigation'

type Dept = { id: string; name: string }

export default function DeptFilter({
  departments,
  currentDept,
  tab,
}: {
  departments: Dept[]
  currentDept?: string
  tab: string
}) {
  const router = useRouter()

  return (
    <select
      value={currentDept ?? ''}
      onChange={(e) => {
        const params = new URLSearchParams()
        params.set('tab', tab)
        if (e.target.value) params.set('dept', e.target.value)
        router.push(`/dashboard/maps?${params.toString()}`)
      }}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/20"
    >
      <option value="">All departments</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
  )
}
