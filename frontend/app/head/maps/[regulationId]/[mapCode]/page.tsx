import { getServerToken } from '@/lib/auth-server'
import { PRIORITY_COLOR, friendlyDate, statusLabel } from '@/lib/labels'
import { notFound } from 'next/navigation'
import ProofUploadForm from './_components/ProofUploadForm'
import StepCheckbox from './_components/StepCheckbox'

type MapStep = { step_number: number; description: string; completed: boolean }
type MapDoc = {
  id: string
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
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to fetch MAP')
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

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <a href="/head/maps" className="text-sm text-gray-400 hover:text-gray-600 mb-6 block">
        ← Back to my action items
      </a>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-gray-400">{map.id as string}</span>
              {map.priority && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    PRIORITY_COLOR[map.priority as string] ?? 'text-gray-600 bg-gray-100'
                  }`}
                >
                  {map.priority as string} Priority
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{map.title as string}</h1>
            <p className="text-sm text-gray-500 mt-1">{map.map_summary as string}</p>
          </div>
          <div className="text-right flex-shrink-0">
            {map.deadline && (
              <p className="text-xs text-gray-500">
                Deadline: <span className="font-semibold">{friendlyDate(map.deadline as string)}</span>
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Status:{' '}
              <span className="font-medium text-gray-700">
                {statusLabel(map.status as string)}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-400">
            Regulation: {data.regulation_title as string} (Regulation no. {data.direction_id as string})
          </p>
          {data.pdf_url && (
            <a
              href={data.pdf_url as string}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap flex items-center gap-1"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M14 3H21V10M21 3L10 14M19 14V19C19 20.1 18.1 21 17 21H5C3.9 21 3 20.1 3 19V7C3 5.9 3.9 5 5 5H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              View original regulation
            </a>
          )}
        </div>
      </div>

      {/* Steps checklist */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Action Steps ({steps.filter((s) => s.completed).length}/{steps.length} completed)
        </h2>
        <div className="space-y-3">
          {steps.map((step) => (
            <StepCheckbox
              key={step.step_number as number}
              regulationId={regulationId}
              mapCode={mapCode}
              stepNum={step.step_number as number}
              completed={step.completed as boolean}
              description={step.description as string}
              token={token!}
              disabled={map.status === 'approved'}
            />
          ))}
        </div>
      </div>

      {/* Proof submission */}
      {map.status !== 'approved' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Submit Proof of Compliance</h2>
          <ProofUploadForm
            regulationId={regulationId}
            mapCode={mapCode}
            token={token!}
          />
        </div>
      )}

      {/* Past submissions */}
      {submissions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Submission History</h2>
          <div className="space-y-3">
            {submissions.map((sub) => (
              <div key={sub._id as string} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-500">{sub.reference_number as string}</span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      sub.review_status === 'approved'
                        ? 'bg-green-50 text-green-700'
                        : sub.review_status === 'rejected'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {sub.review_status === 'approved' ? 'Approved'
                      : sub.review_status === 'rejected' ? 'Needs rework'
                      : 'Waiting for review'}
                  </span>
                </div>
                {sub.notes && (
                  <p className="text-xs text-gray-500 mt-1">{sub.notes as string}</p>
                )}
                {sub.review_note && (
                  <p className="text-xs text-gray-600 mt-1 italic">
                    Review note: {sub.review_note as string}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {friendlyDate(sub.submitted_at as string)} ·{' '}
                  {(sub.file_urls as string[]).length} file(s)
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

