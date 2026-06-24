import { getServerToken } from '@/lib/auth-server'
import { friendlyDate } from '@/lib/labels'
import Link from 'next/link'

async function getRegulations(token: string, page: number) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/regulations?page=${page}&limit=20`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) return { items: [], total: 0 }
  return res.json()
}

const statusBadge: Record<string, string> = {
  processing: 'bg-amber-50 text-amber-700 border-amber-100',
  done:       'bg-green-50 text-green-700 border-green-100',
  failed:     'bg-red-50 text-red-600 border-red-100',
}

function CoverageStages({ reg }: { reg: Record<string, boolean | number> }) {
  const stages = [
    { label: 'Reviewed by AI', ok: !!reg.parsed_ok },
    { label: 'Action items created', ok: !!reg.maps_generated },
    { label: 'Assigned to teams', ok: !!reg.assigned },
  ]
  const fullyHandled = stages.every((s) => s.ok)
  return (
    <div className="flex items-center gap-1.5" title={fullyHandled ? 'Fully handled' : 'Needs attention'}>
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${s.ok ? 'bg-green-500' : 'bg-gray-200'}`}
            title={s.label}
          />
          {i < stages.length - 1 && (
            <span className={`w-3 h-px ${stages[i + 1].ok ? 'bg-green-300' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
      <span className={`text-xs ml-1 ${fullyHandled ? 'text-green-600' : 'text-amber-600'}`}>
        {fullyHandled ? 'Handled' : 'Partial'}
      </span>
    </div>
  )
}

export default async function RegulationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const token = await getServerToken()
  const { page = '1' } = await searchParams
  const currentPage = Math.max(1, parseInt(page, 10))

  const data = await getRegulations(token!, currentPage)
  const totalPages = Math.ceil((data.total ?? 0) / 20)

  const summary = data.summary ?? { total_regulations: 0, parsed: 0, total_maps: 0 }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Regulations</h1>
        <p className="text-gray-500 mt-1 text-sm">
          RBI master directions processed by the compliance agent.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <SummaryStat label="Regulations tracked" value={summary.total_regulations} sub="ingested for your bank" />
        <SummaryStat label="Parsed & summarised" value={summary.parsed} sub="understood by the agent" accent />
        <SummaryStat label="Action items created" value={summary.total_maps} sub="assigned to departments" accent />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">All Regulations</span>
          <span className="text-xs text-gray-400">{data.total ?? 0} total</span>
        </div>

        {data.items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm font-medium text-gray-500">No regulations yet</p>
            <p className="text-xs text-gray-400 mt-1">They will appear here once the agent processes RBI directions.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Regulation No.', 'Title', 'Coverage', 'Action Items', 'Created'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.items.map((reg: Record<string, string | number>) => (
                <tr key={reg.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-xs font-mono text-gray-500 whitespace-nowrap">
                    {reg.direction_id}
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-900 line-clamp-1">{reg.title}</p>
                        {reg.pdf_url && (
                          <a
                            href={reg.pdf_url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open original regulation"
                            className="text-[#ff5d03] hover:text-[#e04f02] flex-shrink-0"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                              <path d="M14 3H21V10M21 3L10 14M19 14V19C19 20.1 18.1 21 17 21H5C3.9 21 3 20.1 3 19V7C3 5.9 3.9 5 5 5H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </a>
                        )}
                      </div>
                      {reg.overall_summary && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{reg.overall_summary}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {reg.status === 'processing' ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadge.processing}`}>
                        processing
                      </span>
                    ) : (
                      <CoverageStages reg={reg as Record<string, boolean | number>} />
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                    {Number(reg.maps_count) > 0 ? (
                      <Link
                        href={`/dashboard/maps?tab=needs_attention`}
                        className="text-[#ff5d03] font-semibold hover:underline"
                      >
                        {reg.maps_count} action item{Number(reg.maps_count) !== 1 ? 's' : ''}
                      </Link>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-400 whitespace-nowrap">
                    {friendlyDate(reg.created_at as string)}
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
                <Link href={`/dashboard/regulations?page=${currentPage - 1}`}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                  &larr; Prev
                </Link>
              )}
              {currentPage < totalPages && (
                <Link href={`/dashboard/regulations?page=${currentPage + 1}`}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                  Next &rarr;
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryStat({
  label, value, sub, accent,
}: {
  label: string
  value: number
  sub: string
  accent?: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent ? 'text-[#ff5d03]' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}
