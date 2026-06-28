import { getServerToken } from '@/lib/auth-server'
import { PRIORITY_COLOR, STATUS_COLOR, friendlyDate, statusLabel } from '@/lib/labels'
import Link from 'next/link'
import MapFilters from './_components/MapFilters'
import PageTransition from '@/app/_components/PageTransition'

type MapItem = {
  regulation_id: string
  map_code: string
  title: string
  department: string
  department_id: string | null
  regulation_title: string
  priority: string | null
  deadline: string | null
  status: string
}

// Fetch a generous batch for the tab — filtering by regulation and pagination then
// happen client-side below, since the backend only supports filtering by department.
async function getMaps(token: string, tab: string): Promise<MapItem[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/maps?tab=${tab}&limit=500`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.items ?? []
}

async function getDepartments(token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/departments`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) return []
  return res.json()
}

const TABS = [
  { key: 'needs_attention', label: 'Needs Attention' },
  { key: 'in_progress',     label: 'In Progress'     },
  { key: 'completed',       label: 'Completed'       },
]
const PAGE_SIZE = 20

function daysAgo(dateStr: string): number | null {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

/** Windowed page numbers with ellipses, e.g. 1 2 3 ... 8 9 — never spams 40 page buttons. */
function pageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const keep = new Set([1, 2, total - 1, total, current - 1, current, current + 1])
  const sorted = [...keep].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const result: (number | '...')[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) result.push('...')
    result.push(p)
    prev = p
  }
  return result
}

function contextLine(map: MapItem): string {
  const dept = map.department || 'The department'
  const dl = map.deadline ? daysAgo(map.deadline) : null
  switch (map.status) {
    case 'submitted':
      return `${dept} submitted proof - pending your review.`
    case 'overdue':
      return dl !== null && dl > 0
        ? `${dept} has not responded. Deadline passed ${dl} day${dl !== 1 ? 's' : ''} ago.`
        : `${dept} is overdue.`
    case 'rejected':
      return `${dept}'s submission was rejected - awaiting resubmission.`
    case 'in_progress':
      return map.deadline ? `${dept} is working on it - due ${friendlyDate(map.deadline)}.` : `${dept} is working on it.`
    case 'approved':
      return `Completed and approved.`
    default:
      return map.deadline ? `Not started by ${dept} - due ${friendlyDate(map.deadline)}.` : `Awaiting action from ${dept}.`
  }
}

export default async function MapsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; dept?: string; reg?: string }>
}) {
  const token = await getServerToken()
  const { tab = 'needs_attention', page = '1', dept, reg } = await searchParams
  const currentPage = Math.max(1, parseInt(page, 10))

  const [allItems, departments] = await Promise.all([
    getMaps(token!, tab),
    getDepartments(token!),
  ])

  // Regulation filter options — derived from the items actually in this tab.
  const regulationOptions = Array.from(
    new Map(allItems.map((m) => [m.regulation_id, m.regulation_title])).entries(),
  ).map(([id, name]) => ({ id, name }))

  const filtered = allItems.filter((m) =>
    (!dept || m.department_id === dept) && (!reg || m.regulation_id === reg),
  )
  const total = filtered.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const items = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const tabHref = (key: string) => {
    const p = new URLSearchParams()
    p.set('tab', key)
    if (dept) p.set('dept', dept)
    if (reg) p.set('reg', reg)
    return `/dashboard/maps?${p.toString()}`
  }
  const pageHref = (p: number) => {
    const params = new URLSearchParams()
    params.set('tab', tab)
    params.set('page', String(p))
    if (dept) params.set('dept', dept)
    if (reg) params.set('reg', reg)
    return `/dashboard/maps?${params.toString()}`
  }

  return (
    <PageTransition>
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Action Items</h1>
        <p className="text-gray-500 mt-1 text-sm">What each department needs to do to comply, and where things stand.</p>
      </div>

      {/* Tab bar + filters */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <MapFilters
          departments={departments.map((d: Record<string, string>) => ({ id: d.id, name: d.name }))}
          regulations={regulationOptions}
          currentDept={dept}
          currentReg={reg}
          tab={tab}
        />
      </div>

      {/* Count */}
      <p className="text-xs text-gray-400 mb-4">{total} action item{total === 1 ? '' : 's'}</p>

      {/* Action item list */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
          <p className="text-sm font-medium text-gray-500">
            {total === 0 && allItems.length > 0 ? 'No action items match these filters' : 'No action items in this category'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {allItems.length > 0
              ? 'Try clearing the department or regulation filter.'
              : tab === 'needs_attention'
              ? "Nothing overdue, not started, or needing rework - good work!"
              : tab === 'in_progress'
              ? 'No action items currently in progress or submitted.'
              : 'No approved action items yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((map, i) => (
            <Link
              key={`${map.regulation_id}-${map.map_code}`}
              href={`/dashboard/maps/${map.regulation_id}/${map.map_code}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-4">
                <span className="text-xs font-semibold text-gray-300 w-6 pt-0.5 flex-shrink-0 text-right">
                  {(currentPage - 1) * PAGE_SIZE + i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">{map.map_code}</span>
                    {map.priority && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[map.priority] ?? 'text-gray-500 bg-gray-100'}`}>
                        {map.priority}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[map.status] ?? 'text-gray-500 bg-gray-100'}`}>
                      {statusLabel(map.status)}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 text-sm">{map.title}</p>
                  <p className="text-xs text-gray-600 mt-1 font-medium">{contextLine(map)}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-0.5">{map.department}</span>
                    <span className="text-xs text-gray-400 truncate">{map.regulation_title}</span>
                  </div>
                </div>
                {map.deadline && (
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-medium ${map.status === 'overdue' ? 'text-red-600' : 'text-gray-500'}`}>
                      {map.status === 'overdue' ? 'Overdue' : 'Due'}
                    </p>
                    <p className={`text-sm font-semibold ${map.status === 'overdue' ? 'text-red-600' : 'text-gray-700'}`}>
                      {friendlyDate(map.deadline)}
                    </p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-4 mt-8 flex-wrap">
          <p className="text-xs text-gray-400">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} of {total}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Link
                href={pageHref(Math.max(1, currentPage - 1))}
                aria-disabled={currentPage === 1}
                className={`px-3 py-1.5 text-xs border border-gray-200 rounded-lg ${
                  currentPage === 1 ? 'pointer-events-none opacity-40' : 'hover:bg-gray-50'
                }`}
              >
                &larr; Prev
              </Link>
              {pageNumbers(currentPage, totalPages).map((p, idx) =>
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-gray-400">…</span>
                ) : (
                  <Link
                    key={p}
                    href={pageHref(p)}
                    className={`min-w-[30px] text-center px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                      p === currentPage
                        ? 'bg-[#ff5d03] text-white border-[#ff5d03] font-semibold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </Link>
                ),
              )}
              <Link
                href={pageHref(Math.min(totalPages, currentPage + 1))}
                aria-disabled={currentPage === totalPages}
                className={`px-3 py-1.5 text-xs border border-gray-200 rounded-lg ${
                  currentPage === totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-gray-50'
                }`}
              >
                Next &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
    </PageTransition>
  )
}
