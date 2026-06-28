'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { gsap } from '@/lib/gsap'

interface Props {
  token: string
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export default function UploadRegulationButton({ token }: Props) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [directionId, setDirectionId] = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [resultMsg, setResultMsg] = useState('')
  const [warning, setWarning] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Animate modal in when opened
  useEffect(() => {
    if (!open) return
    const modal   = modalRef.current
    const overlay = overlayRef.current
    if (!modal || !overlay) return

    const ctx = gsap.context(() => {
      gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' })
      gsap.fromTo(
        modal,
        { opacity: 0, scale: 0.95, y: 16 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'power2.out' },
      )
    })
    return () => ctx.revert()
  }, [open])

  function closeModal() {
    const modal   = modalRef.current
    const overlay = overlayRef.current
    if (!modal || !overlay) { setOpen(false); return }

    gsap.to(overlay, { opacity: 0, duration: 0.18, ease: 'power1.in' })
    gsap.to(modal, {
      opacity: 0, scale: 0.95, y: 10, duration: 0.2, ease: 'power2.in',
      onComplete: () => {
        setOpen(false)
        resetForm()
      },
    })
  }

  function resetForm() {
    setFile(null)
    setTitle('')
    setDirectionId('')
    setUploadState('idle')
    setResultMsg('')
    setWarning(null)
  }

  function onFileChange(f: File | null) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
      setResultMsg('Only PDF files are accepted.')
      setUploadState('error')
      return
    }
    setFile(f)
    setUploadState('idle')
    setResultMsg('')
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ''))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !title.trim()) return

    setUploadState('uploading')
    setResultMsg('')
    setWarning(null)

    const form = new FormData()
    form.append('file', file)
    form.append('title', title.trim())
    if (directionId.trim()) form.append('direction_id', directionId.trim())

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/regulations/upload`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
      )
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.detail ?? `Upload failed (${res.status})`)
      }
      setUploadState('success')
      setResultMsg(`Queued for processing — direction ID: ${json.direction_id}`)
      if (json.warning) setWarning(json.warning)
      router.refresh()
    } catch (err) {
      setUploadState('error')
      setResultMsg(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const busy = uploadState === 'uploading'

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); resetForm() }}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff5d03] text-white text-sm font-semibold hover:bg-[#e04f02] active:scale-[0.97] transition-all shadow-[0_2px_8px_rgba(255,93,3,0.3)]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M17 8L12 3L7 8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 3V15" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        Upload Regulation
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            ref={overlayRef}
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={closeModal}
          />

          {/* Panel */}
          <div
            ref={modalRef}
            className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.18)] border border-gray-100 p-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-gray-900">Upload Regulation PDF</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  The AI agent will parse it and generate action items for your departments.
                </p>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Success state */}
            {uploadState === 'success' ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                      <path d="M1 5.5L5 9.5L13 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-800">Regulation queued successfully</p>
                    <p className="text-xs text-green-700 mt-0.5">{resultMsg}</p>
                    <p className="text-xs text-green-600 mt-1">
                      The AI agent is processing it now. Your regulations page will update when it&apos;s done.
                    </p>
                  </div>
                </div>

                {warning && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
                      <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                    </svg>
                    <span><span className="font-semibold">Note:</span> {warning}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={resetForm}
                    className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Upload another
                  </button>
                  <button
                    onClick={closeModal}
                    className="flex-1 py-2 rounded-xl bg-[#ff5d03] text-white text-sm font-semibold hover:bg-[#e04f02] transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Drop zone */}
                <div
                  className={`border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer ${
                    dragging
                      ? 'border-[#ff5d03] bg-[#ff5d03]/5 scale-[1.01]'
                      : file
                      ? 'border-green-300 bg-green-50/50'
                      : 'border-gray-200 bg-gray-50/60 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => !file && inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    onFileChange(e.dataTransfer.files[0] ?? null)
                  }}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                  />

                  {file ? (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M7 3H14L19 8V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3Z" stroke="#dc2626" strokeWidth="1.5"/>
                          <path d="M14 3V8H19" stroke="#dc2626" strokeWidth="1.5"/>
                          <path d="M9 13H15M9 16H12" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                        <p className="text-xs text-gray-400">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFile(null); setTitle(''); setUploadState('idle'); setResultMsg('') }}
                        className="w-6 h-6 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-400 text-xs flex items-center justify-center flex-shrink-0 transition-colors"
                        aria-label="Remove file"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-8">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${dragging ? 'bg-[#ff5d03]/15' : 'bg-gray-100'}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke={dragging ? '#ff5d03' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M17 8L12 3L7 8" stroke={dragging ? '#ff5d03' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 3V15" stroke={dragging ? '#ff5d03' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <p className={`text-sm font-medium ${dragging ? 'text-[#ff5d03]' : 'text-gray-500'}`}>
                        {dragging ? 'Drop PDF here' : 'Drop PDF or click to browse'}
                      </p>
                      <p className="text-xs text-gray-400">PDF files only</p>
                    </div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Regulation title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Master Direction on KYC 2024"
                    required
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/25 focus:border-[#ff5d03] transition-colors"
                  />
                </div>

                {/* Direction ID (optional) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Direction / Document ID
                    <span className="ml-1.5 text-[10px] font-normal text-gray-400">(optional — auto-generated if blank)</span>
                  </label>
                  <input
                    type="text"
                    value={directionId}
                    onChange={(e) => setDirectionId(e.target.value)}
                    placeholder="e.g. RBI/2024-25/67"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#ff5d03]/25 focus:border-[#ff5d03] transition-colors"
                  />
                </div>

                {/* Info strip */}
                <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-3.5 py-3 text-xs text-gray-500">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="9" stroke="#9ca3af" strokeWidth="1.6"/>
                    <path d="M12 8V8.5M12 11V16" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  <span>
                    The PDF will be stored and the AI agent will automatically generate
                    action items for each of your departments.
                  </span>
                </div>

                {/* Error */}
                {uploadState === 'error' && resultMsg && (
                  <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                      <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    {resultMsg}
                  </div>
                )}

                {/* Upload progress */}
                {busy && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Uploading & queuing…</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#ff5d03] rounded-full animate-pulse w-3/4" />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={busy}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !file || !title.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#ff5d03] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e04f02] active:scale-[0.98] transition-all"
                  >
                    {busy ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Processing…
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M17 8L12 3L7 8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 3V15" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                        Upload & Queue
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
