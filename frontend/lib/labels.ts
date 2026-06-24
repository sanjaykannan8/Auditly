/**
 * Plain-English labels for non-technical compliance officers / department heads.
 * Single source of truth so every page renders the same words and colors for
 * the same underlying status — never show a raw enum value to the user.
 */

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted for review',
  approved: 'Approved',
  rejected: 'Needs rework',
  overdue: 'Overdue',
}

export const STATUS_COLOR: Record<string, string> = {
  pending: 'text-gray-600 bg-gray-100',
  in_progress: 'text-blue-600 bg-blue-50',
  submitted: 'text-purple-700 bg-purple-50',
  approved: 'text-green-700 bg-green-50',
  rejected: 'text-red-600 bg-red-50',
  overdue: 'text-red-700 bg-red-100',
}

export const PRIORITY_COLOR: Record<string, string> = {
  HIGH: 'text-red-600 bg-red-50 border-red-100',
  MEDIUM: 'text-amber-600 bg-amber-50 border-amber-100',
  LOW: 'text-green-600 bg-green-50 border-green-100',
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return ''
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ')
}

/** Humanize a date value — "15 Mar 2026". Passes non-dates through unchanged. */
export function friendlyDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Humanize a timestamp — "15 Mar 2026, 2:30 PM". Passes non-dates through unchanged. */
export function friendlyDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
