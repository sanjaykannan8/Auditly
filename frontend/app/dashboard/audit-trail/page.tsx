import { getServerToken } from '@/lib/auth-server'
import { friendlyDateTime } from '@/lib/labels'
import ExportButton from './_components/ExportButton'

async function getAuditTrail(
  token: string,
  page: number,
  entityType?: string,
) {
  const params = new URLSearchParams({ page: String(page), limit: '50' })
  if (entityType) params.set('entity_type', entityType)
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/audit-trail?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) return { items: [], total: 0 }
  return res.json()
}

const actionLabel: Record<string, string> = {
  'map.submitted':       'Proof submitted',
  'map.approved':        'Action item approved',
  'map.rejected':        'Action item sent back for rework',
  'org.created':         'Organization created',
  'department.created':  'Department created',
  'department.invited':  'Department head invited',
}

const entityLabel: Record<string, string> = {
  map: 'Action item',
  regulation: 'Regulation',
  department: 'Department',
  organization: 'Organization',
}

/** Turn the raw `details` JSON into a one-line human sentence instead of dumping JSON. */
function summarizeDetails(action: string, details: Record<string, unknown> | null): string {
  if (!details) return '-'
  if (action === 'map.submitted') {
    const files = details.files as number | undefined
    const ref = details.reference_number as string | undefined
    return [ref ? `Ref ${ref}` : null, files != null ? `${files} file${files === 1 ? '' : 's'}` : null]
      .filter(Boolean).join(' · ') || '-'
  }
  if (action === 'org.created' || action === 'department.created') {
    return (details.name as string) ?? '-'
  }
  const parts = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
  return parts.length > 0 ? parts.join(' · ') : '-'
}

const ENTITY_TYPES = ['map', 'regulation', 'department', 'organization']

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; entity_type?: string }>
}) {
  const token = await getServerToken()
  const { page = '1', entity_type } = await searchParams
  const currentPage = Math.max(1, parseInt(page, 10))

  const data = await getAuditTrail(token!, currentPage, entity_type)
  const totalPages = Math.ceil((data.total ?? 0) / 50)

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
          <p className="text-gray-500 mt-1 text-sm">A permanent record of every compliance action — ready to show an auditor.</p>
        </div>
        <ExportButton token={token!} />
      </div>

      {/* Entity type filter */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <a
          href="/dashboard/audit-trail"
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            !entity_type ? 'bg-[#ff5d03] text-white border-[#ff5d03]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#ff5d03]/50'
          }`}
        >
          All
        </a>
        {ENTITY_TYPES.map((et) => (
          <a
            key={et}
            href={`/dashboard/audit-trail?entity_type=${et}`}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              entity_type === et ? 'bg-[#ff5d03] text-white border-[#ff5d03]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#ff5d03]/50'
            }`}
          >
            {entityLabel[et]}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Activity Log</span>
          <span className="text-xs text-gray-400">{data.total ?? 0} entries</span>
        </div>

        {data.items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">No audit events yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['When', 'Action', 'What', 'Who', 'Role', 'Details'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.items.map((row: {
                id: string; timestamp: string; action: string; entity_type: string; entity_id: string
                actor_id: string; actor_name: string | null; actor_role: string
                details: Record<string, unknown> | null
              }) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {friendlyDateTime(row.timestamp)}
                  </td>
                  <td className="px-6 py-3 text-xs font-medium text-gray-700 whitespace-nowrap">
                    {actionLabel[row.action] ?? row.action}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-500">
                    {entityLabel[row.entity_type] ?? row.entity_type}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {row.actor_name ?? `...${row.actor_id.slice(-8)}`}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-500 whitespace-nowrap capitalize">
                    {row.actor_role.replace('_', ' ')}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-400 max-w-[240px] truncate">
                    {summarizeDetails(row.action, row.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">Page {currentPage} of {totalPages}</span>
            <div className="flex gap-1">
              {currentPage > 1 && (
                <a href={`/dashboard/audit-trail?page=${currentPage - 1}${entity_type ? `&entity_type=${entity_type}` : ''}`}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                  &larr; Prev
                </a>
              )}
              {currentPage < totalPages && (
                <a href={`/dashboard/audit-trail?page=${currentPage + 1}${entity_type ? `&entity_type=${entity_type}` : ''}`}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                  Next &rarr;
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
