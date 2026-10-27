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

/** One batch creates both documents, or neither. Rules enforce the same invariant. */
export async function createMaintenanceRequest(
  uid: string,
  input: RequestInput,
  db: Firestore = getClientDb()
): Promise<string> {
  if (!uid) throw new Error('Sign in to create a request.')
  const parsed = requestInputSchema.parse(input)
  const requestRef = doc(collection(db, 'maintenanceRequests'))
  const entryId = historyId(requestRef.id, 'OPEN')
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
  await batch.commit()
  return requestRef.id
}

/** Read inside a transaction so simultaneous status changes cannot overwrite each other. */
export async function changeMaintenanceStatus(
  uid: string,
  requestId: string,
  expectedStatus: MaintenanceStatus,
  nextStatus: MaintenanceStatus,
  db: Firestore = getClientDb()
): Promise<void> {
  if (!uid) throw new Error('Sign in to update a request.')
  const requestRef = doc(db, 'maintenanceRequests', requestId)
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
}

export type RequestRecord = MaintenanceRequest & { id: string; pending: boolean }
export type HistoryRecord = StatusHistory & { id: string; pending: boolean }

/** Owner filters are required by the rules; Firestore rules are not query filters. */
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
