import { getServerToken } from '@/lib/auth-server'
import { PRIORITY_COLOR, STATUS_COLOR, statusLabel } from '@/lib/labels'
import Link from 'next/link'
import DeptFilter from './_components/DeptFilter'

async function getMaps(token: string, tab: string, page: number, dept?: string) {
  const params = new URLSearchParams({ tab, page: String(page), limit: '20' })
  if (dept) params.set('department_id', dept)
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/maps?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) return { items: [], total: 0 }
  return res.json()
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

function daysAgo(dateStr: string): number | null {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function contextLine(map: Record<string, string>): string {
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
      return map.deadline ? `${dept} is working on it - due ${map.deadline}.` : `${dept} is working on it.`
    case 'approved':
      return `Completed and approved.`
    default:
      return map.deadline ? `Not started by ${dept} - due ${map.deadline}.` : `Awaiting action from ${dept}.`
  }
}

export default async function MapsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; dept?: string }>
}) {
  const token = await getServerToken()
  const { tab = 'needs_attention', page = '1', dept } = await searchParams
  const currentPage = Math.max(1, parseInt(page, 10))

  const [data, departments] = await Promise.all([
    getMaps(token!, tab, currentPage, dept),
    getDepartments(token!),
  ])
  const totalPages = Math.ceil((data.total ?? 0) / 20)

  const deptHref = (key: string) => {
    const p = new URLSearchParams()
    p.set('tab', key)
    if (dept) p.set('dept', dept)
    return `/dashboard/maps?${p.toString()}`
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Action Items</h1>
        <p className="text-gray-500 mt-1 text-sm">What each department needs to do to comply, and where things stand.</p>
      </div>

      {/* Tab bar + department filter */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={deptHref(t.key)}
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
        <DeptFilter
          departments={departments.map((d: Record<string, string>) => ({ id: d.id, name: d.name }))}
          currentDept={dept}
          tab={tab}
        />
      </div>

      {/* Count */}
      <p className="text-xs text-gray-400 mb-4">{data.total ?? 0} action item{data.total === 1 ? '' : 's'}</p>

      {/* Action item list */}
      {data.items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
          <p className="text-sm font-medium text-gray-500">No action items in this category</p>
          <p className="text-xs text-gray-400 mt-1">
            {tab === 'needs_attention'
              ? "Nothing overdue, not started, or needing rework - good work!"
              : tab === 'in_progress'
              ? 'No action items currently in progress or submitted.'
              : 'No approved action items yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((map: Record<string, string>) => (
            <Link
              key={`${map.regulation_id}-${map.map_code}`}
              href={`/dashboard/maps/${map.regulation_id}/${map.map_code}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
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
                      {map.deadline}
                    </p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {currentPage > 1 && (
            <Link
              href={`/dashboard/maps?tab=${tab}&page=${currentPage - 1}${dept ? `&dept=${dept}` : ''}`}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              &larr; Prev
            </Link>
          )}
          <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
          {currentPage < totalPages && (
            <Link
              href={`/dashboard/maps?tab=${tab}&page=${currentPage + 1}${dept ? `&dept=${dept}` : ''}`}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Next &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
