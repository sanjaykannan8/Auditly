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

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ProofUploadForm({ regulationId, mapCode, token }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function addFiles(incoming: File[]) {
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...incoming.filter((f) => !names.has(f.name))]
    })
    setError(null)
  }

  function toDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

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
      setError('Please attach at least one file before submitting.')
      return
    }
    setUploading(true)
    setError(null)
    setUploadProgress(0)

    try {
      const fileUrls: string[] = []
      for (let i = 0; i < files.length; i++) {
        fileUrls.push(await uploadViaBackend(files[i]))
        setUploadProgress(Math.round(((i + 1) / files.length) * 80))
      }

      setUploadProgress(90)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/head/maps/${regulationId}/${mapCode}/submissions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ file_urls: fileUrls, notes }),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Submission failed')
      }
      setUploadProgress(100)
      const { reference_number } = await res.json()
      setConfirmation({
        reference: reference_number,
        fileCount: files.length,
        submittedAt: new Date().toLocaleString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }),
      })
      setFiles([])
      setNotes('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  /* ── Confirmation receipt ── */
  if (confirmation) {
    return (
      <div className="rounded-xl border-2 border-green-200 bg-green-50 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M1 7L6 12L17 1" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Submitted successfully</p>
            <p className="text-xs text-gray-500">Keep this reference for your records.</p>
          </div>
        </div>

        <dl className="space-y-2 text-sm bg-white rounded-xl border border-green-100 px-4 py-3">
          {[
            { label: 'Reference', value: confirmation.reference, mono: true },
            { label: 'Submitted on', value: confirmation.submittedAt },
            { label: 'Files attached', value: `${confirmation.fileCount} file${confirmation.fileCount !== 1 ? 's' : ''}` },
            { label: 'Status', value: 'Awaiting compliance review', colored: true },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <dt className="text-gray-400 text-xs">{row.label}</dt>
              <dd className={`text-xs font-semibold ${row.colored ? 'text-purple-700' : row.mono ? 'font-mono text-gray-900' : 'text-gray-900'}`}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <button
          className="mt-3 text-xs text-green-700 underline underline-offset-2 hover:text-green-800"
          onClick={() => setConfirmation(null)}
        >
          Submit additional proof
        </button>
      </div>
    )
  }

  /* ── Upload form ── */
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl transition-all duration-200 ${
          dragging
            ? 'border-[#ff5d03] bg-[#ff5d03]/5 scale-[1.01]'
            : files.length > 0
            ? 'border-gray-200 bg-white'
            : 'border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50'
        }`}
        onClick={() => files.length === 0 && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
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
          <div
            className="flex flex-col items-center justify-center gap-2 py-10 cursor-pointer select-none"
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${dragging ? 'bg-[#ff5d03]/15' : 'bg-gray-100'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke={dragging ? '#ff5d03' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M17 8L12 3L7 8" stroke={dragging ? '#ff5d03' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 3V15" stroke={dragging ? '#ff5d03' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="text-center">
              <p className={`text-sm font-medium ${dragging ? 'text-[#ff5d03]' : 'text-gray-600'}`}>
                {dragging ? 'Drop to attach' : 'Drop files or click to browse'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">PDF, images, email files — up to 10MB each</p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 group"
                >
                  {/* File icon / image preview */}
                  {isImage(f) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className="w-9 h-9 object-cover rounded-md flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-md bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M7 3H14L19 8V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3Z" stroke="#9ca3af" strokeWidth="1.5"/>
                        <path d="M14 3V8H19" stroke="#9ca3af" strokeWidth="1.5"/>
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{f.name}</p>
                    <p className="text-[10px] text-gray-400">{formatSize(f.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, idx) => idx !== i)) }}
                    className="w-5 h-5 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 text-gray-400 text-xs flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="Remove file"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-[#ff5d03]/40 hover:text-[#ff5d03] transition-colors"
            >
              + Add more files
            </button>
          </div>
        )}
      </div>

      {/* Notes */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes for the compliance officer (optional)"
        rows={2}
        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/20 focus:border-[#ff5d03] resize-none transition-colors"
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
            <circle cx="12" cy="12" r="9" stroke="#dc2626" strokeWidth="1.8" />
            <path d="M12 8V12M12 16H12.01" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      {/* Upload progress */}
      {uploading && uploadProgress > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Uploading{uploadProgress < 90 ? ` ${uploadProgress}%` : '…'}</span>
            <span>{uploadProgress < 90 ? 'Files' : 'Submitting'}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#ff5d03] rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={uploading || files.length === 0}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#ff5d03] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e04f02] active:scale-[0.98] transition-all"
      >
        {uploading ? (
          <>
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Submitting…
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M17 8L12 3L7 8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 3V15" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            Submit Proof
          </>
        )}
      </button>
    </form>
  )
}
