// Local emulator only: no .env or real credentials are read.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  writeBatch,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  terminate,
} from 'firebase/firestore'

const endpoint = process.env.FIRESTORE_EMULATOR_HOST
if (!endpoint || !endpoint.startsWith('127.0.0.1:')) {
  throw new Error('Run through the documented emulator command; real Firebase is forbidden.')
}
const apps = []
function client(uid) {
  const app = initializeApp(
    { projectId: 'demo-pendant-maintenance', apiKey: 'demo-only', appId: 'demo-only' },
    `client-${apps.length}`
  )
  const db = getFirestore(app)
  connectFirestoreEmulator(
    db,
    '127.0.0.1',
    Number(endpoint.split(':')[1]),
    uid ? { mockUserToken: { sub: uid, user_id: uid } } : {}
  )
  apps.push({ app, db })
  return db
}
const alice = client('alice')
const bob = client('bob')
const anonymous = client()
const denied = (promise) => assert.rejects(promise, (error) => error.code === 'permission-denied')

function initial(db, changes = {}) {
  const ref = doc(collection(db, 'maintenanceRequests'))
  const entryId = `${ref.id}_OPEN`
  const request = {
    pendantId: 'P001',
    problemType: 'NO_SIGNAL',
    description: 'Pendant stopped reporting.',
    status: 'OPEN',
    createdBy: 'alice',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastHistoryId: entryId,
    _schemaVersion: 1,
    ...changes,
  }
  const history = {
    requestId: ref.id,
    fromStatus: null,
    toStatus: 'OPEN',
    changedBy: 'alice',
    changedAt: serverTimestamp(),
    _schemaVersion: 1,
  }
  return { ref, entryId, request, history }
}
async function create(db = alice, changes = {}, historyChanges = {}) {
  const record = initial(db, changes)
  const batch = writeBatch(db)
  batch.set(record.ref, record.request)
  batch.set(doc(db, 'statusHistory', record.entryId), { ...record.history, ...historyChanges })
  await batch.commit()
  return record
}
async function transition(db, id, before, after, changes = {}, historyChanges = {}) {
  const entryId = `${id}_${after}`
  const batch = writeBatch(db)
  batch.update(doc(db, 'maintenanceRequests', id), {
    status: after,
    updatedAt: serverTimestamp(),
    lastHistoryId: entryId,
    ...changes,
  })
  batch.set(doc(db, 'statusHistory', entryId), {
    requestId: id,
    fromStatus: before,
    toStatus: after,
    changedBy: 'alice',
    changedAt: serverTimestamp(),
    _schemaVersion: 1,
    ...historyChanges,
  })
  return batch.commit()
}

test('full lifecycle stores three immutable entries and rejects completed changes', async () => {
  const { ref, entryId } = await create(alice, {
    description: 'First line of problem.\nSecond line of detail.',
  })
  await transition(alice, ref.id, 'OPEN', 'IN_PROGRESS')
  await transition(alice, ref.id, 'IN_PROGRESS', 'COMPLETED')
  assert.equal((await getDoc(ref)).data().status, 'COMPLETED')
  const history = await getDocs(
    query(
      collection(alice, 'statusHistory'),
      where('changedBy', '==', 'alice'),
      where('requestId', '==', ref.id)
    )
  )
  assert.equal(history.size, 3)
  await denied(updateDoc(ref, { description: 'Changed completed description' }))
  await denied(transition(alice, ref.id, 'COMPLETED', 'OPEN'))
  await denied(updateDoc(doc(alice, 'statusHistory', entryId), { toStatus: 'COMPLETED' }))
  await denied(deleteDoc(doc(alice, 'statusHistory', entryId)))
  await denied(deleteDoc(ref))
})

test('request and history must be created together', async () => {
  const record = initial(alice)
  await denied(setDoc(record.ref, record.request))
  await denied(setDoc(doc(alice, 'statusHistory', record.entryId), record.history))
})

test('status updates without history and history without updates are denied', async () => {
  const { ref } = await create()
  await denied(
    updateDoc(ref, {
      status: 'IN_PROGRESS',
      updatedAt: serverTimestamp(),
      lastHistoryId: `${ref.id}_IN_PROGRESS`,
    })
  )
  await denied(
    setDoc(doc(alice, 'statusHistory', `${ref.id}_IN_PROGRESS`), {
      requestId: ref.id,
      fromStatus: 'OPEN',
      toStatus: 'IN_PROGRESS',
      changedBy: 'alice',
      changedAt: serverTimestamp(),
      _schemaVersion: 1,
    })
  )
  assert.equal((await getDoc(ref)).data().status, 'OPEN')
})

test('unauthenticated and other-user access are rejected', async () => {
  const { ref, entryId } = await create()
  await denied(getDoc(doc(bob, 'maintenanceRequests', ref.id)))
  await denied(getDoc(doc(anonymous, 'maintenanceRequests', ref.id)))
  await denied(getDoc(doc(bob, 'statusHistory', entryId)))
  await denied(create(anonymous))
  await denied(create(bob))
  await denied(transition(bob, ref.id, 'OPEN', 'IN_PROGRESS'))
})

test('invalid fields, forged owners, timestamps and descriptions are rejected', async () => {
  for (const changes of [
    { pendantId: 'P999' },
    { problemType: 'INVENTED' },
    { description: 'short' },
    { description: ' '.repeat(20) },
    { description: '\n'.repeat(20) },
    { description: 'a'.repeat(501) },
    { createdBy: 'bob' },
    { status: 'COMPLETED' },
    { createdAt: new Date(0) },
    { updatedAt: new Date(0) },
    { extra: 'unexpected' },
    { _schemaVersion: 2 },
  ])
    await denied(create(alice, changes))
})

test('history mismatches roll back the entire batch', async () => {
  await denied(create(alice, {}, { changedBy: 'bob' }))
  await denied(create(alice, {}, { fromStatus: 'OPEN' }))
  const { ref } = await create()
  await denied(transition(alice, ref.id, 'OPEN', 'IN_PROGRESS', {}, { changedAt: new Date(0) }))
  await denied(transition(alice, ref.id, 'OPEN', 'IN_PROGRESS', {}, { fromStatus: null }))
  assert.equal((await getDoc(ref)).data().status, 'OPEN')
})

test('skipping, reversing, editing fields and duplicate transitions are rejected', async () => {
  const { ref } = await create()
  await denied(transition(alice, ref.id, 'OPEN', 'COMPLETED'))
  await denied(transition(alice, ref.id, 'OPEN', 'IN_PROGRESS', { pendantId: 'P002' }))
  await transition(alice, ref.id, 'OPEN', 'IN_PROGRESS')
  await denied(transition(alice, ref.id, 'OPEN', 'IN_PROGRESS'))
  await denied(transition(alice, ref.id, 'IN_PROGRESS', 'OPEN'))
})

test('different requests for the same pendant are permitted', async () => {
  const first = await create()
  const second = await create()
  assert.notEqual(first.ref.id, second.ref.id)
})

after(async () => {
  await Promise.all(
    apps.map(async ({ app, db }) => {
      await terminate(db)
      await deleteApp(app)
    })
  )
})
