import { getServerToken } from '@/lib/auth-server'
import { PRIORITY_COLOR, STATUS_COLOR, friendlyDate, statusLabel } from '@/lib/labels'
import Link from 'next/link'

async function getMaps(token: string, status?: string, page = 1) {
  const params = new URLSearchParams({ page: String(page), limit: '50' })
  if (status) params.set('status', status)
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/head/maps?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) return { items: [], total: 0 }
  return res.json()
}

const TABS = [
  { key: undefined,     label: 'All'         },
  { key: 'pending',     label: 'Pending'     },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'submitted',   label: 'Submitted'   },
]

export default async function HeadMapsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const token = await getServerToken()
  const { status } = await searchParams
  const data = await getMaps(token!, status)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Action Items</h1>
        <p className="text-gray-500 mt-1 text-sm">Compliance work assigned to your department</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <Link
            key={t.key ?? 'all'}
            href={t.key ? `/head/maps?status=${t.key}` : '/head/maps'}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              status === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {data.items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-base font-medium text-gray-500">No action items found</p>
          <p className="text-sm text-gray-400 mt-1">Check back after the compliance officer assigns regulations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((map: Record<string, string | number>) => (
            <Link
              key={`${map.regulation_id}-${map.map_code}`}
              href={`/head/maps/${map.regulation_id}/${map.map_code}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">{map.map_code}</span>
                    {map.priority && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[map.priority as string] ?? 'text-gray-500 bg-gray-100'}`}>
                        {map.priority}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[map.status as string] ?? 'text-gray-500 bg-gray-100'}`}>
                      {statusLabel(map.status as string)}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 text-sm">{map.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{map.map_summary}</p>
                  <p className="text-xs text-gray-400 mt-1">From: {map.regulation_title}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {map.deadline && (
                    <p className={`text-xs font-medium ${map.status === 'overdue' ? 'text-red-600' : 'text-gray-500'}`}>
                      Due {friendlyDate(map.deadline as string)}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {map.steps_done}/{map.steps_total} steps
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
