import { getServerToken } from '@/lib/auth-server'
import { PRIORITY_COLOR, friendlyDate, friendlyDateTime, statusLabel } from '@/lib/labels'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ProofUploadForm from './_components/ProofUploadForm'
import StepCheckbox from './_components/StepCheckbox'
import MapDetailAnimations from './_components/MapDetailAnimations'

type MapStep = { step_number: number; description: string; completed: boolean }
type MapDoc = {
  map_code: string
  title: string
  department?: string
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

async function getMapDetail(token: string, regulationId: string, mapCode: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/head/maps/${regulationId}/${mapCode}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to fetch MAP detail')
  return res.json()
}

export default async function MapDetailPage({
  params,
}: {
  params: Promise<{ regulationId: string; mapCode: string }>
}) {
  const token = await getServerToken()
  const { regulationId, mapCode } = await params
  const data = await getMapDetail(token!, regulationId, mapCode)

  if (!data) notFound()

  const map = data.map as MapDoc
  const steps = map.steps ?? []
  const submissions = (data.submissions as Submission[]) ?? []
  const completedSteps = steps.filter((s) => s.completed).length
  const stepPct = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0
  const isApproved = map.status === 'approved'
  const latestSubmission = submissions[0] ?? null

  return (
    <MapDetailAnimations>
      <div className="p-6 max-w-3xl mx-auto">

        {/* Breadcrumb */}
        <div data-anim="breadcrumb" className="mb-5">
          <Link
            href="/head/maps"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors group"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="group-hover:-translate-x-0.5 transition-transform">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to my action items
          </Link>
        </div>

        {/* Header card */}
        <div data-anim="header" className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] p-6 mb-4">

          {/* Approved banner */}
          {isApproved && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-5">
              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                  <path d="M1 5.5L5 9.5L13 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">This action item has been approved</p>
                <p className="text-xs text-green-600">Your compliance officer has reviewed and accepted your submission.</p>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Badges row */}
              <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                  {map.map_code}
                </span>
                {map.priority && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${PRIORITY_COLOR[map.priority] ?? 'text-gray-600 bg-gray-100 border-gray-100'}`}>
                    {map.priority} Priority
                  </span>
                )}
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  isApproved ? 'bg-green-50 text-green-700' :
                  map.status === 'submitted' ? 'bg-purple-50 text-purple-700' :
                  map.status === 'in_progress' ? 'bg-blue-50 text-blue-700' :
                  map.status === 'overdue' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {statusLabel(map.status)}
                </span>
              </div>

              <h1 className="text-xl font-bold text-gray-900 leading-snug">{map.title}</h1>
              {map.map_summary && (
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{map.map_summary}</p>
              )}
            </div>

            {/* Deadline */}
            {map.deadline && !isApproved && (
              <div className="flex-shrink-0 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Deadline</p>
                <p className={`text-sm font-bold mt-0.5 ${map.status === 'overdue' ? 'text-red-600' : 'text-gray-900'}`}>
                  {friendlyDate(map.deadline)}
                </p>
              </div>
            )}
          </div>

          {/* Regulation reference */}
          <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-50">
            <p className="text-xs text-gray-400 min-w-0 truncate">
              <span className="text-gray-500 font-medium">Regulation:</span>{' '}
              {data.regulation_title as string}
              {data.direction_id && (
                <span className="ml-1 font-mono text-gray-400">(#{data.direction_id})</span>
              )}
            </p>
            {data.pdf_url && (
              <a
                href={data.pdf_url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-[#ff5d03] hover:text-[#e04f02] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M14 3H21V10M21 3L10 14M19 14V19C19 20.1 18.1 21 17 21H5C3.9 21 3 20.1 3 19V7C3 5.9 3.9 5 5 5H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Original regulation
              </a>
            )}
          </div>
        </div>

        {/* Steps checklist */}
        {steps.length > 0 && (
          <div data-anim="steps" className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)] p-6 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Action Steps</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{completedSteps}/{steps.length}</span>
                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    data-step-bar
                    className={`h-full rounded-full ${isApproved ? 'bg-green-500' : 'bg-[#ff5d03]'}`}
                    style={{ width: `${stepPct}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              {steps.map((step) => (
                <StepCheckbox
                  key={step.step_number}
                  regulationId={regulationId}
                  mapCode={mapCode}
                  stepNum={step.step_number}
                  completed={step.completed}
                  description={step.description}
                  token={token!}
                  disabled={isApproved}
                />
              ))}
            </div>
          </div>
        )}

        {/* Rejected feedback */}
        {map.status === 'rejected' && latestSubmission?.review_note && (
          <div data-anim="feedback" className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8V12M12 16H12.01" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="9" stroke="#dc2626" strokeWidth="1.8" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-red-800">Submission needs rework</p>
                <p className="text-sm text-red-700 mt-1">{latestSubmission.review_note}</p>
              </div>
            </div>
          </div>
        )}

        {/* Proof submission form */}
        {!isApproved && (
          <div data-anim="upload" className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)] p-6 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#ff5d03]/10 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="#ff5d03" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M17 8L12 3L7 8" stroke="#ff5d03" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 3V15" stroke="#ff5d03" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Submit Proof of Compliance</h2>
              {map.status === 'submitted' && (
                <span className="ml-auto text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                  Awaiting review
                </span>
              )}
            </div>
            {map.status === 'submitted' ? (
              <div className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-3 text-sm text-purple-700">
                Your last submission is pending review by the compliance officer. You can still submit additional proof below.
              </div>
            ) : null}
            <div className={map.status === 'submitted' ? 'mt-4' : ''}>
              <ProofUploadForm
                regulationId={regulationId}
                mapCode={mapCode}
                token={token!}
              />
            </div>
          </div>
        )}

        {/* Submission history */}
        {submissions.length > 0 && (
          <div data-anim="history" className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)] p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Submission History</h2>
            <div className="space-y-3">
              {submissions.map((sub, i) => (
                <div
                  key={sub._id}
                  className={`rounded-xl border p-4 ${
                    sub.review_status === 'approved'
                      ? 'bg-green-50/50 border-green-100'
                      : sub.review_status === 'rejected'
                      ? 'bg-red-50/50 border-red-100'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      {i === 0 && <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Latest</span>}
                      <span className="text-xs font-mono text-gray-500">{sub.reference_number}</span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      sub.review_status === 'approved' ? 'bg-green-100 text-green-700' :
                      sub.review_status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {sub.review_status === 'approved' ? '✓ Approved' :
                       sub.review_status === 'rejected' ? '✗ Needs rework' :
                       'Under review'}
                    </span>
                  </div>

                  {sub.notes && (
                    <p className="text-xs text-gray-600 mt-1.5">{sub.notes}</p>
                  )}
                  {sub.review_note && (
                    <div className="mt-2 pl-3 border-l-2 border-red-200">
                      <p className="text-xs text-red-600 font-medium">Reviewer note:</p>
                      <p className="text-xs text-red-600 mt-0.5">{sub.review_note}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] text-gray-400">{friendlyDateTime(sub.submitted_at)}</span>
                    {(sub.file_urls?.length ?? 0) > 0 && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-[11px] text-gray-400">
                          {sub.file_urls!.length} file{sub.file_urls!.length !== 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MapDetailAnimations>
  )
}
