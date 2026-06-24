'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  regulationId: string
  mapCode: string
  token: string
}

type Confirmation = {
  reference: string
  fileCount: number
  submittedAt: string
}

function isImage(f: File) {
  return f.type.startsWith('image/')
}

export default function ProofUploadForm({ regulationId, mapCode, token }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function addFiles(incoming: File[]) {
    setFiles((prev) => [...prev, ...incoming])
  }

  function toDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Upload through our backend (signed) — no unsigned Cloudinary preset needed.
  async function uploadViaBackend(file: File): Promise<string> {
    const dataUrl = await toDataUrl(file)
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/head/upload-proof`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data_url: dataUrl, filename: file.name }),
      },
    )
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(typeof e.detail === 'string' ? e.detail : `Upload failed (${res.status})`)
    }
    const json = await res.json()
    return json.url as string
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0) {
      setError('Please select at least one file')
      return
    }
    setUploading(true)
    setError(null)

    try {
      const fileUrls = await Promise.all(files.map(uploadViaBackend))

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/head/maps/${regulationId}/${mapCode}/submissions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ file_urls: fileUrls, notes }),
        },
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ?? 'Submission failed')
      }
      const { reference_number } = await res.json()
      setConfirmation({
        reference: reference_number,
        fileCount: files.length,
        submittedAt: new Date().toLocaleString(),
      })
      setFiles([])
      setNotes('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // ── Confirmation receipt (screenshot/print friendly) ──
  if (confirmation) {
    return (
      <div className="rounded-xl border-2 border-green-200 bg-green-50/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M1 7L6 12L17 1" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Proof submitted successfully</p>
            <p className="text-xs text-gray-500">Keep this confirmation for your records.</p>
          </div>
        </div>

        <dl className="space-y-2 text-sm bg-white rounded-lg border border-green-100 p-4">
          <div className="flex justify-between">
            <dt className="text-gray-500">Reference number</dt>
            <dd className="font-mono font-semibold text-gray-900">{confirmation.reference}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Submitted on</dt>
            <dd className="text-gray-900">{confirmation.submittedAt}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Files attached</dt>
            <dd className="text-gray-900">{confirmation.fileCount} file{confirmation.fileCount !== 1 ? 's' : ''}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Status</dt>
            <dd className="text-purple-700 font-medium">Awaiting compliance review</dd>
          </div>
        </dl>

        <button
          className="mt-4 text-xs text-green-700 underline"
          onClick={() => setConfirmation(null)}
        >
          Submit additional proof
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-300 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          addFiles(Array.from(e.dataTransfer.files))
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.eml,.msg,.doc,.docx"
          className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
        />
        {files.length === 0 ? (
          <>
            <p className="text-sm text-gray-500">Drop files here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">PDF, images, or email files (.eml, .msg)</p>
          </>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" onClick={(e) => e.stopPropagation()}>
            {files.map((f, i) => (
              <div key={i} className="relative group border border-gray-100 rounded-lg overflow-hidden bg-gray-50">
                {isImage(f) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-20 object-cover" />
                ) : (
                  <div className="w-full h-20 flex flex-col items-center justify-center text-gray-400">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M7 3H14L19 8V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3Z" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M14 3V8H19" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  </div>
                )}
                <p className="text-[10px] text-gray-500 truncate px-1.5 py-1">{f.name}</p>
                <button
                  type="button"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 border border-gray-200 text-gray-400 hover:text-red-500 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="h-20 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-gray-300 hover:text-gray-500"
            >
              + Add more
            </button>
          </div>
        )}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes (optional)"
        rows={2}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/20 resize-none"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={uploading || files.length === 0}
        className="w-full py-2.5 rounded-lg bg-[#ff5d03] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e04f02] transition-colors"
      >
        {uploading ? 'Uploading & submitting…' : 'Submit Proof'}
      </button>
    </form>
  )
}
