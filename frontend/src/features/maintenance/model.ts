import type { Timestamp } from 'firebase/firestore'
import { z } from 'zod'

// These are the five demo pendants shown in the dropdown.
export const PENDANT_IDS = ['P001', 'P002', 'P003', 'P004', 'P005'] as const
export const PROBLEM_TYPES = ['NO_SIGNAL', 'BATTERY', 'DAMAGE', 'OTHER'] as const
export const STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED'] as const
export type MaintenanceStatus = (typeof STATUSES)[number]

// Only these three fields come from the request form.
export const requestInputSchema = z
  .object({
    pendantId: z.enum(PENDANT_IDS),
    problemType: z.enum(PROBLEM_TYPES),
    description: z
      .string()
      .trim()
      .min(10, 'Describe the problem in at least 10 characters.')
      .max(500, 'Use no more than 500 characters.'),
  })
  .strict()
export type RequestInput = z.infer<typeof requestInputSchema>

// The saved request adds its status, owner and timestamps to the form fields.
export interface MaintenanceRequest extends RequestInput {
  status: MaintenanceStatus
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  lastHistoryId: string
  _schemaVersion: 1
}

// Each status change gets a new history document.
export interface StatusHistory {
  requestId: string
  fromStatus: MaintenanceStatus | null
  toStatus: MaintenanceStatus
  changedBy: string
  changedAt: Timestamp
  _schemaVersion: 1
}

// Work moves forward only. Completed requests cannot be reopened.
export function isAllowedTransition(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  return (from === 'OPEN' && to === 'IN_PROGRESS') || (from === 'IN_PROGRESS' && to === 'COMPLETED')
}

// Each request/status pair gets one history ID. Rules block another entry with that ID.
export function historyId(requestId: string, status: MaintenanceStatus): string {
  return `${requestId}_${status}`
}
