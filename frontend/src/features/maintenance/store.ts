import {
  collection,
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
