import { getServerToken } from '@/lib/auth-server'
import { friendlyDate } from '@/lib/labels'
import AddDepartment from './_components/AddDepartment'
import InviteButton from './_components/InviteButton'
import RemindButton from './_components/RemindButton'

async function getDepartments(token: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/departments`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) return []
  return res.json()
}

function daysAgo(dateStr: string): number | null {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function urgentLine(item: { title?: string; status?: string; deadline?: string } | null): string {
  if (!item) return 'No open items - all caught up.'
  const dl = item.deadline ? daysAgo(item.deadline) : null
  const what = item.title ?? 'An action item'
  switch (item.status) {
    case 'overdue':
      return dl !== null && dl > 0
        ? `${what} - overdue by ${dl} day${dl !== 1 ? 's' : ''}.`
        : `${what} - overdue.`
    case 'rejected':
      return `${what} - submission needs rework, awaiting resubmission.`
    case 'submitted':
      return `${what} - submitted, awaiting your review.`
    case 'in_progress':
      return item.deadline ? `${what} - in progress, due ${friendlyDate(item.deadline)}.` : `${what} - in progress.`
    default:
      return item.deadline ? `${what} - not started, due ${friendlyDate(item.deadline)}.` : `${what} - not started.`
  }
}

export default async function DepartmentsPage() {
  const token = await getServerToken()
  const departments = await getDepartments(token!)

  const totalDepts = departments.length
  const avgCompletion = totalDepts > 0
    ? Math.round(departments.reduce((sum: number, d: Record<string, number>) => sum + d.completion_rate, 0) / totalDepts)
    : 0
  const totalOverdue = departments.reduce((sum: number, d: Record<string, number>) => sum + d.overdue_count, 0)
  const assignedDepts = departments.filter((d: Record<string, string>) => d.head_user_id).length

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-500 mt-1 text-sm">Monitor compliance status and manage department heads.</p>
        </div>
        <AddDepartment token={token!} />
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Departments" value={totalDepts} />
        <SummaryCard label="Heads Assigned" value={`${assignedDepts}/${totalDepts}`} />
        <SummaryCard label="Avg Completion" value={`${avgCompletion}%`} accent={avgCompletion >= 70} />
        <SummaryCard label="Total Overdue" value={totalOverdue} warn={totalOverdue > 0} />
      </div>

      {departments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-24 text-center">
          <p className="text-base font-semibold text-gray-600">No departments found</p>
          <p className="text-sm text-gray-400 mt-1">They were created during onboarding.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {departments.map((dept: Record<string, string | number>) => (
            <div key={dept.id as string} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{dept.name}</p>
                  {dept.objective && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{dept.objective}</p>
                  )}
                </div>
                {dept.head_user_id ? (
                  <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                    Assigned
                  </span>
                ) : (
                  <span className="text-xs bg-gray-50 text-gray-500 border border-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                    No one assigned yet
                  </span>
                )}
              </div>

              {/* Most urgent item - the headline */}
              <div className={`rounded-lg px-3 py-2.5 mb-3 ${
                (dept.overdue_count as number) > 0 ? 'bg-red-50' : dept.urgent_item ? 'bg-amber-50' : 'bg-gray-50'
              }`}>
                <p className={`text-xs font-medium ${
                  (dept.overdue_count as number) > 0 ? 'text-red-700' : dept.urgent_item ? 'text-amber-700' : 'text-gray-500'
                }`}>
                  {urgentLine(dept.urgent_item as { title?: string; status?: string; deadline?: string } | null)}
                </p>
              </div>

              {/* Completion bar - secondary */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (dept.completion_rate as number) >= 70 ? 'bg-green-500' : 'bg-[#ff5d03]'
                    }`}
                    style={{ width: `${dept.completion_rate}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{dept.completion_rate}% done</span>
              </div>

              {/* Action: remind assigned head, or invite one */}
              {dept.head_user_id ? (
                <RemindButton deptId={dept.id as string} token={token!} />
              ) : (
                <InviteButton
                  deptId={dept.id as string}
                  deptName={dept.name as string}
                  token={token!}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label, value, accent, warn,
}: {
  label: string
  value: string | number
  accent?: boolean
  warn?: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className={`text-2xl font-bold ${warn ? 'text-red-500' : accent ? 'text-green-600' : 'text-gray-800'}`}>
        {value}
      </p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
