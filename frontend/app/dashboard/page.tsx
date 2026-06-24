import { getServerToken, getServerUser } from '@/lib/auth-server'
import { friendlyDate } from '@/lib/labels'
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
type RegulationItem = {
  id: string
  title: string
  status: string
  overall_summary: string
  maps_count: number
  created_at: string
}

const CARD = 'bg-white rounded-2xl border border-gray-100 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.08)]'

export default async function DashboardHome() {
  const token = await getServerToken()
  const user = await getServerUser()
  const firstName = user?.username ?? 'there'

  const [brief, priorityActions, heatmap, org, regulations] = await Promise.all([
    apiFetch('/api/dashboard/brief', token!),
    apiFetch('/api/dashboard/priority-actions', token!),
    apiFetch('/api/dashboard/department-heatmap', token!),
    apiFetch('/api/org', token!),
    apiFetch('/api/regulations?limit=4', token!),
  ])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const overdueCount = brief?.overdue_count ?? 0
  const processingCount = brief?.processing_count ?? 0
  const actionCount = (priorityActions ?? []).length
  const memberCount = org?.members?.length ?? 0
  const departments: Department[] = heatmap ?? []
  const recentRegs: RegulationItem[] = regulations?.items ?? []
  const summary = regulations?.summary ?? { total_regulations: 0, total_maps: 0 }

  // Average completion across departments — an honest, labeled approximation, not a fabricated number.
  const score = departments.length > 0
    ? Math.round(departments.reduce((sum, d) => sum + d.completion_rate, 0) / departments.length)
    : null

  // One verdict that actually agrees with the Priority Actions list below it — overdue first,
  // then "needs attention" (covers pending/submitted that aren't yet overdue), then AI processing.
  const verdict =
    overdueCount > 0
      ? { dot: 'bg-red-500', text: 'text-red-700', pulse: true, label: `${overdueCount} action item${overdueCount === 1 ? '' : 's'} overdue` }
      : actionCount > 0
      ? { dot: 'bg-amber-500', text: 'text-amber-700', pulse: false, label: `${actionCount} action item${actionCount === 1 ? '' : 's'} need attention` }
      : processingCount > 0
      ? { dot: 'bg-blue-500', text: 'text-blue-700', pulse: false, label: `${processingCount} regulation${processingCount === 1 ? '' : 's'} being reviewed by AI` }
      : { dot: 'bg-green-500', text: 'text-green-700', pulse: false, label: 'Everything is on track' }

  // Worst-first so the departments that actually need a look aren't buried alphabetically.
  const sortedHeatmap = [...departments].sort((a, b) => {
    if (a.overdue_count !== b.overdue_count) return b.overdue_count - a.overdue_count
    return a.completion_rate - b.completion_rate
  })

  return (
    <div className="p-8 max-w-6xl mx-auto w-full">
      {/* Header — branded, with a soft decorative glow for a more premium first impression */}
      <div className="relative flex items-center gap-3.5 mb-7">
        <div className="absolute -top-16 -left-10 w-56 h-56 bg-[#ff5d03]/10 rounded-full blur-3xl pointer-events-none" />
        {org?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logo_url} alt="" className="relative w-12 h-12 rounded-2xl object-contain flex-shrink-0" />
        ) : (
          <div className="relative w-12 h-12 rounded-2xl bg-[#ff5d03]/10 flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-[#ff5d03]">{(org?.name ?? firstName).charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div className="relative">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{greeting}, {firstName}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {org?.name ? `${org.name} · ` : ''}Here&apos;s where compliance stands right now.
          </p>
        </div>
      </div>

      {/* Overview strip — one bordered rail with dividers, not four boxed-in boxes */}
      <div className={`${CARD} grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100 mb-6 overflow-hidden`}>
        <StatCell icon={<RegulationsGlyph />} label="Regulations tracked" value={summary.total_regulations} href="/dashboard/regulations" />
        <StatCell icon={<ActionItemsGlyph />} label="Action items created" value={summary.total_maps} href="/dashboard/maps" />
        <StatCell icon={<DepartmentsGlyph />} label="Departments" value={departments.length} href="/dashboard/departments" />
        <StatCell icon={<MembersGlyph />} label="Team members" value={memberCount} href="/dashboard/settings" />
      </div>

      {/* Today's Brief + Compliance Score, side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <div className={`lg:col-span-2 relative ${CARD} p-6 overflow-hidden`}>
          <div className="absolute -right-10 -bottom-16 w-48 h-48 bg-[#ff5d03]/[0.06] rounded-full blur-2xl pointer-events-none" />
          <span className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#ff5d03] bg-[#ff5d03]/10 mb-4">
            Today&apos;s Brief
          </span>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${verdict.dot} ${verdict.pulse ? 'animate-pulse' : ''}`} />
            <p className={`text-lg font-bold tracking-tight ${verdict.text}`}>{verdict.label}</p>
          </div>
          <p className="text-sm leading-relaxed text-gray-600 max-w-2xl mb-5">
            {brief?.text ?? 'Loading your compliance summary...'}
          </p>
          <div className="flex items-stretch divide-x divide-gray-100 border-t border-gray-100 pt-4 -mx-1">
            <Metric href="/dashboard/maps?tab=needs_attention" label="Overdue" value={overdueCount} danger={overdueCount > 0} />
            <Metric href="/dashboard/regulations" label="New today" value={brief?.new_today ?? 0} />
            <Metric href="/dashboard/regulations" label="Reviewed by AI" value={processingCount} />
          </div>
        </div>

        {/* Compliance score — a real, labeled average so officers get one number to anchor on */}
        <div className={`${CARD} p-6 flex flex-col items-center justify-center text-center`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-400 mb-4">Compliance Score</p>
          {score === null ? (
            <p className="text-sm text-gray-400 py-8">No departments configured yet.</p>
          ) : (
            <>
              <ScoreRing value={score} />
              <p className="text-xs text-gray-400 mt-3">Average completion across departments</p>
            </>
          )}
        </div>
      </div>

      {/* Priority Actions + Latest Regulations side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <div className={`lg:col-span-2 ${CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 tracking-tight">Priority Actions</h2>
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

        {/* Latest Regulations — what's new, at a glance */}
        <div className={`${CARD} overflow-hidden flex flex-col`}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 tracking-tight">Latest Regulations</h2>
            <Link href="/dashboard/regulations" className="text-xs text-[#ff5d03] hover:text-[#e04f02] font-medium whitespace-nowrap">
              View all &rarr;
            </Link>
          </div>
          {recentRegs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-10 px-5 text-center">
              <p className="text-sm text-gray-400">Nothing ingested yet — new RBI directions will show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentRegs.map((reg) => (
                <Link
                  key={reg.id}
                  href={reg.maps_count > 0 ? '/dashboard/maps?tab=needs_attention' : '/dashboard/regulations'}
                  className="block px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">{reg.title}</p>
                    {reg.status === 'processing' && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full flex-shrink-0">AI</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                    {reg.overall_summary || 'Being reviewed by AI...'}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] text-gray-400">{friendlyDate(reg.created_at)}</span>
                    {reg.maps_count > 0 && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-[11px] text-[#ff5d03] font-medium">{reg.maps_count} action item{reg.maps_count === 1 ? '' : 's'}</span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Department heatmap - worst first, so weekly review starts where it matters */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 tracking-tight">Departments to Watch</h2>
            <p className="text-xs text-gray-400 mt-0.5">Sorted by what needs attention first.</p>
          </div>
          <Link href="/dashboard/departments" className="text-sm text-[#ff5d03] hover:text-[#e04f02] font-medium whitespace-nowrap">
            Manage &rarr;
          </Link>
        </div>
        {sortedHeatmap.length === 0 ? (
          <div className={`${CARD} py-12 text-center text-sm text-gray-400`}>
            No departments configured.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {sortedHeatmap.map((d) => {
              const rate = d.completion_rate
              const overdue = d.overdue_count
              const bar =
                rate >= 70 ? 'bg-green-500' : overdue > 0 ? 'bg-red-500' : 'bg-[#ff5d03]'
              const glow =
                rate >= 70 ? 'shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                : overdue > 0 ? 'shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                : 'shadow-[0_0_8px_rgba(255,93,3,0.4)]'
              return (
                <Link
                  key={d.dept_id}
                  href={`/dashboard/maps?tab=needs_attention&dept=${d.dept_id}`}
                  className="bg-white rounded-2xl border border-gray-100 p-4 shadow-[0_6px_16px_-10px_rgba(15,23,42,0.1)] hover:shadow-[0_10px_22px_-10px_rgba(15,23,42,0.16)] hover:-translate-y-0.5 transition-all duration-200"
                >
                  <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <p className="text-2xl font-bold text-gray-900 tracking-tight">{rate}%</p>
                    <span className={`text-xs ${overdue > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                      {overdue > 0 ? `${overdue} overdue` : 'on track'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2.5">
                    <div className={`h-full rounded-full ${bar} ${glow}`} style={{ width: `${rate}%` }} />
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
    <Link href={href} className="flex-1 px-4 first:pl-1 hover:opacity-70 transition-opacity active:scale-[0.98]">
      <p className={`text-2xl font-bold tracking-tight ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </Link>
  )
}

function StatCell({
  icon, label, value, href,
}: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-5 py-4 hover:bg-[#fff8f3] transition-colors active:scale-[0.99]"
    >
      <div className="w-9 h-9 rounded-xl bg-[#ff5d03]/[0.08] flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] group-hover:bg-[#ff5d03]/[0.14] transition-colors">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 tracking-tight leading-tight">{value}</p>
        <p className="text-xs text-gray-500 truncate">{label}</p>
      </div>
    </Link>
  )
}

/** A real, computed ring (not decorative) — circumference math via SVG stroke-dasharray. */
function ScoreRing({ value }: { value: number }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(100, Math.max(0, value)) / 100)
  const color = value >= 70 ? '#10b981' : value >= 40 ? '#ff5d03' : '#ef4444'

  return (
    <div className="relative w-32 h-32">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="10" />
        <circle
          cx="64" cy="64" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold text-gray-900 tracking-tight">{value}%</span>
      </div>
    </div>
  )
}

/* ─── Icons — thin, consistent stroke weight matching the sidebar's visual language ─── */

function RegulationsGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M7 3H17C18.1 3 19 3.9 19 5V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3Z" stroke="#ff5d03" strokeWidth="1.5" />
      <path d="M9 8H15" stroke="#ff5d03" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 12H15" stroke="#ff5d03" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 16H12" stroke="#ff5d03" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ActionItemsGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#ff5d03" strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#ff5d03" strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#ff5d03" strokeWidth="1.5" />
      <path d="M16 16.5L18 18.5L21.5 14.5" stroke="#ff5d03" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DepartmentsGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="5" rx="1" stroke="#ff5d03" strokeWidth="1.5" />
      <rect x="2" y="13" width="6" height="5" rx="1" stroke="#ff5d03" strokeWidth="1.5" />
      <rect x="16" y="13" width="6" height="5" rx="1" stroke="#ff5d03" strokeWidth="1.5" />
      <path d="M12 7V10M12 10H6V13M12 10H18V13" stroke="#ff5d03" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MembersGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3.2" stroke="#ff5d03" strokeWidth="1.5" />
      <path d="M3 20C3 16.5 5.5 14.5 9 14.5C12.5 14.5 15 16.5 15 20" stroke="#ff5d03" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 8.5C17.4 8.5 18.5 7.3 18.5 6C18.5 4.7 17.4 3.5 16 3.5" stroke="#ff5d03" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 14.7C19.3 15.2 21 16.8 21 20" stroke="#ff5d03" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
