import type { MaintenanceStatus } from './model'

export const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
}
export const PROBLEM_LABELS = {
  NO_SIGNAL: 'No signal',
  BATTERY: 'Battery problem',
  DAMAGE: 'Physical damage',
  OTHER: 'Other',
} as const

export function formatTimestamp(value: { toDate: () => Date } | null | undefined): string {
  return value
    ? value.toDate().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Confirming time…'
}

export function maintenanceError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code.includes('permission-denied'))
    return 'Access was denied. Check that you are signed in and the maintenance Firestore rules are deployed.'
  if (code.includes('unavailable') || code.includes('network'))
    return 'The connection is unavailable. Check your internet connection and try again.'
  if (code.includes('unauthenticated')) return 'Your session has expired. Please sign in again.'
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
