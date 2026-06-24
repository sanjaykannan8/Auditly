import { getServerToken } from '@/lib/auth-server'
import { PRIORITY_COLOR, STATUS_COLOR, friendlyDate, friendlyDateTime, statusLabel } from '@/lib/labels'
import Link from 'next/link'
import { notFound } from 'next/navigation'
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
  const submission = data.latest_submission as Submission | null

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href="/dashboard/maps" className="text-sm text-gray-400 hover:text-gray-600 mb-6 block">
        ← Back to action items
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-mono text-gray-400">{map.id as string}</span>
              {map.priority && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[map.priority as string] ?? 'text-gray-500 bg-gray-100'}`}>
                  {map.priority as string} Priority
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[map.status as string] ?? 'text-gray-500 bg-gray-100'}`}>
                {statusLabel(map.status as string)}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{map.title as string}</h1>
            <p className="text-sm text-gray-500 mt-1">{map.map_summary as string}</p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {map.deadline && (
              <div className="text-right">
                <p className="text-xs text-gray-400">Deadline</p>
                <p className={`text-sm font-semibold ${map.status === 'overdue' ? 'text-red-600' : 'text-gray-700'}`}>
                  {friendlyDate(map.deadline as string)}
                </p>
              </div>
            )}
            <StatusSelect
              regulationId={regulationId}
              mapCode={mapCode}
              current={map.status as string}
              token={token!}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            {data.regulation_title as string} · Regulation no. {data.direction_id as string} · {map.department as string}
          </p>
          {data.pdf_url && (
            <a
              href={data.pdf_url as string}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[#ff5d03] hover:text-[#e04f02] whitespace-nowrap flex items-center gap-1"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M14 3H21V10M21 3L10 14M19 14V19C19 20.1 18.1 21 17 21H5C3.9 21 3 20.1 3 19V7C3 5.9 3.9 5 5 5H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Original regulation
            </a>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Action Steps ({steps.filter((s) => s.completed).length}/{steps.length} completed)
        </h2>
        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.step_number as number} className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                step.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {step.completed && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p className={`text-sm ${step.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                <span className="text-gray-400 text-xs mr-1">{step.step_number as number}.</span>
                {step.description as string}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Latest submission */}
      {submission ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
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

          <div className="space-y-2 mb-4 text-xs text-gray-500">
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
                    className="text-xs text-[#ff5d03] border border-[#ff5d03]/30 rounded-lg px-3 py-1.5 hover:bg-[#ff5d03]/5 transition-colors"
                  >
                    File {i + 1} ↗
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
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-400">No submission yet</p>
          <p className="text-xs text-gray-400 mt-1">The department head hasn&apos;t submitted proof yet.</p>
        </div>
      )}
    </div>
  )
}
