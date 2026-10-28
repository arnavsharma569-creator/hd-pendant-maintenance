import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
  doc,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { getClientDb } from '@/lib/firebase/client'
import {
  historyId,
  isAllowedTransition,
  requestInputSchema,
  type MaintenanceRequest,
  type MaintenanceStatus,
  type RequestInput,
  type StatusHistory,
  STATUSES,
} from './model'

// Development messages identify the step without printing user data or credentials.
export function debugMaintenance(message: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[maintenance] ${message}`)
  }
}

// Save the request and its first history entry together. If one fails, neither is saved.
export async function createMaintenanceRequest(
  uid: string,
  input: RequestInput,
  db: Firestore = getClientDb()
): Promise<string> {
  if (!uid) throw new Error('Sign in to create a request.')
  const parsed = requestInputSchema.parse(input)
  const requestRef = doc(collection(db, 'maintenanceRequests'))
  const entryId = historyId(requestRef.id, 'OPEN')
  debugMaintenance('Saving request and initial history')
  const batch = writeBatch(db)
  batch.set(requestRef, {
    ...parsed,
    status: 'OPEN',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastHistoryId: entryId,
    _schemaVersion: 1,
  })
  batch.set(doc(db, 'statusHistory', entryId), {
    requestId: requestRef.id,
    fromStatus: null,
    toStatus: 'OPEN',
    changedBy: uid,
    changedAt: serverTimestamp(),
    _schemaVersion: 1,
  })
  try {
    await batch.commit()
    debugMaintenance('Request and initial history saved')
  } catch (error) {
    debugMaintenance('Request save failed')
    throw error
  }
  return requestRef.id
}

// Read the latest status before changing it and adding the matching history entry.
export async function changeMaintenanceStatus(
  uid: string,
  requestId: string,
  expectedStatus: MaintenanceStatus,
  nextStatus: MaintenanceStatus,
  db: Firestore = getClientDb()
): Promise<void> {
  if (!uid) throw new Error('Sign in to update a request.')
  const requestRef = doc(db, 'maintenanceRequests', requestId)
  debugMaintenance('Updating request status and history')
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(requestRef)
      if (!snapshot.exists()) throw new Error('This request no longer exists.')
      const current = snapshot.data() as MaintenanceRequest
      if (current.createdBy !== uid) throw new Error('You can only update your own requests.')
      if (current.status !== expectedStatus) {
        throw new Error('This request has changed. Check its current status and try again.')
      }
      if (!isAllowedTransition(current.status, nextStatus)) {
        throw new Error('That status change is not allowed.')
      }
      const entryId = historyId(requestId, nextStatus)
      transaction.update(requestRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        lastHistoryId: entryId,
      })
      transaction.set(doc(db, 'statusHistory', entryId), {
        requestId,
        fromStatus: current.status,
        toStatus: nextStatus,
        changedBy: uid,
        changedAt: serverTimestamp(),
        _schemaVersion: 1,
      })
    })
    debugMaintenance('Status and history updated')
  } catch (error) {
    debugMaintenance('Status update failed')
    throw error
  }
}

export type RequestRecord = MaintenanceRequest & { id: string; pending: boolean }
export type HistoryRecord = StatusHistory & { id: string; pending: boolean }

// Ask for this user’s requests only. Firestore rules do not filter the query for us.
export function watchMaintenanceRequests(
  uid: string,
  onChange: (rows: RequestRecord[]) => void,
  onError: (error: Error) => void,
  db: Firestore = getClientDb()
): Unsubscribe {
  const owned = query(collection(db, 'maintenanceRequests'), where('createdBy', '==', uid))
  return onSnapshot(
    owned,
    { includeMetadataChanges: true },
    (snapshot) => {
      const rows = snapshot.docs.map((entry) => ({
        ...(entry.data({ serverTimestamps: 'estimate' }) as MaintenanceRequest),
        id: entry.id,
        pending: entry.metadata.hasPendingWrites,
      }))
      // Small demo collection: sort locally to avoid requiring a composite index.
      rows.sort(
        (a, b) =>
          (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0) ||
          a.id.localeCompare(b.id)
      )
      onChange(rows)
    },
    onError
  )
}

export function watchStatusHistory(
  uid: string,
  requestId: string,
  onChange: (rows: HistoryRecord[]) => void,
  onError: (error: Error) => void,
  db: Firestore = getClientDb()
): Unsubscribe {
  // Read history for this request and user, then show it in status order.
  const owned = query(
    collection(db, 'statusHistory'),
    where('changedBy', '==', uid),
    where('requestId', '==', requestId)
  )
  return onSnapshot(
    owned,
    { includeMetadataChanges: true },
    (snapshot) => {
      const rows = snapshot.docs.map((entry) => ({
        ...(entry.data({ serverTimestamps: 'estimate' }) as StatusHistory),
        id: entry.id,
        pending: entry.metadata.hasPendingWrites,
      }))
      rows.sort((a, b) => STATUSES.indexOf(a.toStatus) - STATUSES.indexOf(b.toStatus))
      onChange(rows)
    },
    onError
  )
}
