import { getServerToken } from '@/lib/auth-server'
import { PRIORITY_COLOR, STATUS_COLOR, friendlyDate, friendlyDateTime, statusLabel } from '@/lib/labels'
import { notFound } from 'next/navigation'
import BackButton from './_components/BackButton'
import ReviewForm from './_components/ReviewForm'
import StatusSelect from './_components/StatusSelect'

type MapStep = { step_number: number; description: string; completed: boolean }
type MapDoc = {
  id: string
  title: string
  department?: string
  department_id?: string | null
  map_summary?: string
  priority?: string | null
  deadline?: string | null
  steps?: MapStep[]
  status: string
}
type Submission = {
  _id: string
  reference_number: string
  submitted_at: string
  notes?: string | null
  review_status: string
  review_note?: string | null
  file_urls?: string[]
}

async function getMap(token: string, regulationId: string, mapCode: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/maps/${regulationId}/${mapCode}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to load MAP')
  return res.json()
}

const CARD = 'bg-white rounded-2xl border border-gray-100 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.08)]'

export default async function ComplianceMapDetail({
  params,
}: {
  params: Promise<{ regulationId: string; mapCode: string }>
}) {
  const token = await getServerToken()
  const { regulationId, mapCode } = await params
  const data = await getMap(token!, regulationId, mapCode)

  if (!data) notFound()

  const map = data.map as MapDoc
  const steps = map.steps ?? []
  const doneCount = steps.filter((s) => s.completed).length
  const progress = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0
  const submission = data.latest_submission as Submission | null

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <BackButton />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Hero */}
          <div className={`${CARD} p-6`}>
            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
              {map.priority && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[map.priority as string] ?? 'text-gray-500 bg-gray-100'}`}>
                  {map.priority as string} Priority
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[map.status as string] ?? 'text-gray-500 bg-gray-100'}`}>
                {statusLabel(map.status as string)}
              </span>
              <span className="text-xs font-mono text-gray-300">{map.id as string}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">{map.title as string}</h1>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{map.map_summary as string}</p>

            {steps.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-400">{doneCount} of {steps.length} steps done</span>
                  <span className="text-xs font-medium text-gray-500">{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-[#ff5d03]'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Steps — vertical timeline */}
          <div className={`${CARD} p-6`}>
            <h2 className="text-sm font-semibold text-gray-700 mb-5">
              Action Steps <span className="text-gray-400 font-normal">({doneCount}/{steps.length} completed)</span>
            </h2>
            <div className="relative">
              {steps.map((step, i) => {
                const isLast = i === steps.length - 1
                return (
                  <div key={step.step_number as number} className="relative flex items-start gap-3.5 pb-5 last:pb-0">
                    {!isLast && (
                      <span className={`absolute left-[9px] top-5 -bottom-0 w-px ${step.completed ? 'bg-green-200' : 'bg-gray-200'}`} />
                    )}
                    <div className={`relative z-10 w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                      step.completed ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
                    }`}>
                      {step.completed && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <p className={`text-sm pt-0.5 ${step.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      <span className="text-gray-400 text-xs mr-1.5">{step.step_number as number}.</span>
                      {step.description as string}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Latest submission */}
          {submission ? (
            <div className={`${CARD} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Latest Submission</h2>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  submission.review_status === 'approved'
                    ? 'bg-green-50 text-green-700'
                    : submission.review_status === 'rejected'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-purple-50 text-purple-700'
                }`}>
                  {submission.review_status === 'approved' ? 'Approved'
                    : submission.review_status === 'rejected' ? 'Needs rework'
                    : 'Waiting on your review'}
                </span>
              </div>

              <div className="space-y-1.5 mb-4 text-xs text-gray-500">
                <p>Submitted by {map.department as string} on {friendlyDateTime(submission.submitted_at as string)}</p>
                {submission.notes && <p>Notes: {submission.notes as string}</p>}
                {submission.review_note && (
                  <p className="text-gray-600 italic">Previous review note: {submission.review_note as string}</p>
                )}
                <p className="text-gray-400 font-mono">Ref: {submission.reference_number as string}</p>
              </div>

              {/* Proof files */}
              {(submission.file_urls as string[])?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Proof files</p>
                  <div className="flex flex-wrap gap-2">
                    {(submission.file_urls as string[]).map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-700 bg-gray-50 hover:bg-[#fff8f3] hover:text-[#ff5d03] rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M7 3H14L19 8V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3Z" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M14 3V8H19" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        File {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Review form — only show if pending */}
              {submission.review_status === 'pending' && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-600 mb-3">Review this submission</p>
                  <ReviewForm
                    submissionId={submission._id as string}
                    token={token!}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className={`${CARD} p-10 text-center`}>
              <div className="w-11 h-11 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M7 3H14L19 8V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3Z" stroke="#9ca3af" strokeWidth="1.5" />
                  <path d="M14 3V8H19" stroke="#9ca3af" strokeWidth="1.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500">No submission yet</p>
              <p className="text-xs text-gray-400 mt-1">The department head hasn&apos;t submitted proof yet.</p>
            </div>
          )}
        </div>

        {/* Details sidebar */}
        <div className="lg:col-span-1">
          <div className={`${CARD} p-6 lg:sticky lg:top-8 space-y-5`}>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Status</p>
              <StatusSelect
                regulationId={regulationId}
                mapCode={mapCode}
                current={map.status as string}
                token={token!}
              />
            </div>

            {map.deadline && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Deadline</p>
                <p className={`text-sm font-semibold ${map.status === 'overdue' ? 'text-red-600' : 'text-gray-700'}`}>
                  {friendlyDate(map.deadline as string)}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-400 mb-0.5">Department</p>
              <p className="text-sm font-medium text-gray-700">{map.department as string}</p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Regulation</p>
              <p className="text-sm font-medium text-gray-700 leading-snug">{data.regulation_title as string}</p>
              <p className="text-xs text-gray-400 mt-0.5">Regulation no. {data.direction_id as string}</p>
              {data.pdf_url && (
                <a
                  href={data.pdf_url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#ff5d03] hover:text-[#e04f02]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M14 3H21V10M21 3L10 14M19 14V19C19 20.1 18.1 21 17 21H5C3.9 21 3 20.1 3 19V7C3 5.9 3.9 5 5 5H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Original regulation
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
