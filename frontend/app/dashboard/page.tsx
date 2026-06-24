import { getServerToken, getServerUser } from '@/lib/auth-server'
import Link from 'next/link'
import PriorityActions from './_components/PriorityActions'

async function apiFetch(path: string, token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json()
}

type Department = { dept_id: string; name: string; completion_rate: number; overdue_count: number }

export default async function DashboardHome() {
  const token = await getServerToken()
  const user = await getServerUser()
  const firstName = user?.username ?? 'there'

  const [brief, priorityActions, heatmap] = await Promise.all([
    apiFetch('/api/dashboard/brief', token!),
    apiFetch('/api/dashboard/priority-actions', token!),
    apiFetch('/api/dashboard/department-heatmap', token!),
  ])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const overdueCount = brief?.overdue_count ?? 0
  const processingCount = brief?.processing_count ?? 0
  const actionCount = (priorityActions ?? []).length

  // One clear verdict, computed once, instead of making the reader add up three numbers themselves.
  const verdict =
    overdueCount > 0
      ? { dot: 'bg-red-500', text: 'text-red-700', label: `${overdueCount} action item${overdueCount === 1 ? '' : 's'} overdue` }
      : processingCount > 0
      ? { dot: 'bg-amber-500', text: 'text-amber-700', label: `${processingCount} regulation${processingCount === 1 ? '' : 's'} being reviewed by AI` }
      : { dot: 'bg-green-500', text: 'text-green-700', label: 'Everything is on track' }

  // Worst-first so the departments that actually need a look aren't buried alphabetically.
  const sortedHeatmap = [...(heatmap ?? [])].sort((a: Department, b: Department) => {
    if (a.overdue_count !== b.overdue_count) return b.overdue_count - a.overdue_count
    return a.completion_rate - b.completion_rate
  })

  return (
    <div className="p-8 max-w-6xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {firstName}</h1>
        <p className="text-sm text-gray-400 mt-1">Here&apos;s where compliance stands right now.</p>
      </div>

      {/* Today's Brief - one verdict, then the supporting detail */}
      <div className="bg-gradient-to-br from-[#fff4ed] to-white border border-[#ff5d03]/20 rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff5d03]" />
          <span className="text-xs font-semibold text-[#ff5d03] uppercase tracking-wide">Today&apos;s Brief</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${verdict.dot}`} />
          <p className={`text-lg font-bold ${verdict.text}`}>{verdict.label}</p>
        </div>
        <p className="text-sm leading-relaxed text-gray-600 max-w-3xl">
          {brief?.text ?? 'Loading your compliance summary...'}
        </p>
        <div className="flex items-stretch gap-3 mt-5">
          <Metric
            href="/dashboard/maps?tab=needs_attention"
            label="Overdue"
            value={overdueCount}
            danger={overdueCount > 0}
          />
          <Metric href="/dashboard/regulations" label="New today" value={brief?.new_today ?? 0} />
          <Metric href="/dashboard/regulations" label="Being reviewed by AI" value={processingCount} />
        </div>
      </div>

      {/* Priority Action List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Priority Actions</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {actionCount === 0
                ? 'Nothing needs you right now.'
                : `${actionCount} thing${actionCount === 1 ? '' : 's'} need you today, ranked by urgency.`}
            </p>
          </div>
          <Link href="/dashboard/maps" className="text-sm text-[#ff5d03] hover:text-[#e04f02] font-medium whitespace-nowrap">
            All action items &rarr;
          </Link>
        </div>
        <PriorityActions actions={priorityActions ?? []} token={token!} />
      </div>

      {/* Department heatmap - worst first, so weekly review starts where it matters */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Departments to Watch</h2>
            <p className="text-xs text-gray-400 mt-0.5">Sorted by what needs attention first.</p>
          </div>
          <Link href="/dashboard/departments" className="text-sm text-[#ff5d03] hover:text-[#e04f02] font-medium whitespace-nowrap">
            Manage &rarr;
          </Link>
        </div>
        {sortedHeatmap.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-400">
            No departments configured.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {sortedHeatmap.map((d: Department) => {
              const rate = d.completion_rate
              const overdue = d.overdue_count
              const ring =
                overdue > 0 ? 'border-red-200 bg-red-50/40 hover:border-red-300'
                : rate >= 70 ? 'border-green-200 bg-green-50/40 hover:border-green-300'
                : rate > 0 ? 'border-amber-200 bg-amber-50/40 hover:border-amber-300'
                : 'border-gray-200 bg-white hover:border-gray-300'
              const bar =
                rate >= 70 ? 'bg-green-500' : overdue > 0 ? 'bg-red-500' : 'bg-[#ff5d03]'
              return (
                <Link
                  key={d.dept_id}
                  href={`/dashboard/maps?tab=needs_attention&dept=${d.dept_id}`}
                  className={`rounded-xl border p-4 transition-colors ${ring}`}
                >
                  <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <p className="text-2xl font-bold text-gray-900">{rate}%</p>
                    <span className={`text-xs ${overdue > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                      {overdue > 0 ? `${overdue} overdue` : 'on track'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${rate}%` }} />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({
  href, label, value, danger,
}: { href: string; label: string; value: number; danger?: boolean }) {
  return (
    <Link
      href={href}
      className="flex-1 bg-white/70 rounded-xl border border-[#ff5d03]/10 px-4 py-3 hover:bg-white hover:border-[#ff5d03]/30 transition-colors"
    >
      <p className={`text-2xl font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </Link>
  )
}
