import { getServerToken } from '@/lib/auth-server'
import { PRIORITY_COLOR, STATUS_COLOR, friendlyDate, statusLabel } from '@/lib/labels'
import Link from 'next/link'
import HeadMapsAnimations from './_components/HeadMapsAnimations'

async function getMaps(token: string, tab?: string) {
  const params = new URLSearchParams({ limit: '200' })
  if (tab && tab !== 'all') params.set('status', tab)
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/head/maps?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) return { items: [], total: 0 }
  return res.json()
}

function daysUntil(dateStr: string): number | null {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function DeadlineChip({ deadline, status }: { deadline: string | null; status: string }) {
  if (!deadline) return null
  const days = daysUntil(deadline)
  if (status === 'approved') return null

  if (status === 'overdue' || (days !== null && days < 0)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
        Overdue
      </span>
    )
  }
  if (days !== null && days <= 3) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
        Due in {days}d
      </span>
    )
  }
  return (
    <span className="text-xs text-gray-400">Due {friendlyDate(deadline)}</span>
  )
}

const TABS = [
  { key: 'all',         label: 'All'          },
  { key: 'pending',     label: 'Not started'  },
  { key: 'in_progress', label: 'In Progress'  },
  { key: 'submitted',   label: 'Submitted'    },
  { key: 'approved',    label: 'Approved'     },
]

export default async function HeadMapsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const token = await getServerToken()
  const { tab = 'all' } = await searchParams

  // Always fetch all items so we can compute accurate summary stats
  const allData = await getMaps(token!)
  const allItems: Record<string, string | number>[] = allData.items ?? []

  // Filter for current tab display
  const displayItems = tab === 'all'
    ? allItems
    : allItems.filter((m) => m.status === tab)

  // Summary stats
  const total = allItems.length
  const overdue = allItems.filter((m) => m.status === 'overdue').length
  const submitted = allItems.filter((m) => m.status === 'submitted').length
  const approved = allItems.filter((m) => m.status === 'approved').length
  const completionRate = total > 0 ? Math.round((approved / total) * 100) : 0

  const tabHref = (key: string) =>
    key === 'all' ? '/head/maps' : `/head/maps?tab=${key}`

  return (
    <HeadMapsAnimations>
      <div className="p-6 max-w-4xl mx-auto">

        {/* Page header */}
        <div data-anim="header" className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">My Action Items</h1>
          <p className="text-sm text-gray-400 mt-0.5">Compliance work assigned to your department</p>
        </div>

        {/* Summary strip */}
        <div data-anim="stats" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total" value={total} />
          <StatCard label="Overdue" value={overdue} danger={overdue > 0} />
          <StatCard label="Awaiting review" value={submitted} accent />
          <StatCard label="Approved" value={approved} success />
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div data-anim="progress" className="bg-white rounded-xl border border-gray-100 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.08)] px-5 py-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Department completion</span>
              <span className="text-sm font-bold text-gray-900">{completionRate}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                data-progress-bar
                className={`h-full rounded-full transition-all duration-700 ${
                  completionRate >= 70 ? 'bg-green-500' : completionRate >= 40 ? 'bg-[#ff5d03]' : 'bg-red-500'
                }`}
                style={{ width: `${completionRate}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{approved} of {total} action items completed</p>
          </div>
        )}

        {/* Tab bar */}
        <div data-anim="tabs" className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
          {TABS.map((t) => {
            const count = t.key === 'all'
              ? allItems.length
              : allItems.filter((m) => m.status === t.key || (t.key === 'pending' && m.status === 'pending')).length
            const isActive = tab === t.key || (tab === 'all' && t.key === 'all')
            return (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    isActive ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* List */}
        {displayItems.length === 0 ? (
          <div data-anim="list" className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.06)]">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M9 5H7C5.9 5 5 5.9 5 7V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V7C19 5.9 18.1 5 17 5H15" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M9 5C9 3.9 9.9 3 11 3H13C14.1 3 15 3.9 15 5V6H9V5Z" stroke="#9ca3af" strokeWidth="1.5"/>
                <path d="M9 12L11 14L15 10" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-500">
              {tab === 'all' ? 'No action items yet' : `No ${TABS.find(t => t.key === tab)?.label.toLowerCase()} items`}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {tab === 'all'
                ? 'Your compliance officer will assign items here.'
                : 'Try switching to a different tab.'}
            </p>
          </div>
        ) : (
          <div data-anim="list" className="space-y-2.5">
            {displayItems.map((map) => {
              const stepsTotal = Number(map.steps_total) || 0
              const stepsDone = Number(map.steps_done) || 0
              const stepPct = stepsTotal > 0 ? Math.round((stepsDone / stepsTotal) * 100) : 0

              return (
                <Link
                  key={`${map.regulation_id}-${map.map_code}`}
                  data-map-card
                  href={`/head/maps/${map.regulation_id}/${map.map_code}`}
                  className="block bg-white rounded-xl border border-gray-100 p-4 hover:border-[#ff5d03]/30 hover:shadow-[0_4px_16px_-8px_rgba(255,93,3,0.15)] transition-all duration-200 group"
                >
                  <div className="flex items-start gap-3">
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      map.status === 'approved' ? 'bg-green-500' :
                      map.status === 'overdue' ? 'bg-red-500 animate-pulse' :
                      map.status === 'submitted' ? 'bg-purple-500' :
                      map.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300'
                    }`} />

                    <div className="flex-1 min-w-0">
                      {/* Top row: code + badges */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[11px] font-mono text-gray-400">{map.map_code}</span>
                        {map.priority && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[map.priority as string] ?? 'text-gray-500 bg-gray-100 border-gray-100'}`}>
                            {map.priority}
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[map.status as string] ?? 'text-gray-500 bg-gray-100'}`}>
                          {statusLabel(map.status as string)}
                        </span>
                        <DeadlineChip deadline={map.deadline as string | null} status={map.status as string} />
                      </div>

                      {/* Title */}
                      <p className="font-semibold text-gray-900 text-sm group-hover:text-[#ff5d03] transition-colors line-clamp-1">
                        {map.title}
                      </p>

                      {/* Summary */}
                      {map.map_summary && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{map.map_summary}</p>
                      )}

                      {/* Regulation source */}
                      <p className="text-[11px] text-gray-400 mt-1 truncate">
                        {map.regulation_title}
                      </p>

                      {/* Step progress */}
                      {stepsTotal > 0 && (
                        <div className="flex items-center gap-2 mt-2.5">
                          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                map.status === 'approved' ? 'bg-green-500' : 'bg-[#ff5d03]'
                              }`}
                              style={{ width: `${stepPct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-gray-400 flex-shrink-0">
                            {stepsDone}/{stepsTotal} steps
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Chevron */}
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none"
                      className="flex-shrink-0 text-gray-300 group-hover:text-[#ff5d03] transition-colors mt-1"
                    >
                      <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </HeadMapsAnimations>
  )
}

function StatCard({
  label, value, danger, accent, success,
}: {
  label: string
  value: number
  danger?: boolean
  accent?: boolean
  success?: boolean
}) {
  const color = danger && value > 0
    ? 'text-red-600'
    : success ? 'text-green-600'
    : accent && value > 0 ? 'text-purple-700'
    : 'text-gray-900'

  const bg = danger && value > 0
    ? 'bg-red-50 border-red-100'
    : success ? 'bg-green-50 border-green-100'
    : accent && value > 0 ? 'bg-purple-50 border-purple-100'
    : 'bg-white border-gray-100'

  return (
    <div className={`rounded-xl border p-4 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.06)] ${bg}`}>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
