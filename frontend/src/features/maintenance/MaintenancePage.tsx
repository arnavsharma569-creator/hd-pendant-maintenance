'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import {
  PENDANT_IDS,
  PROBLEM_TYPES,
  STATUSES,
  requestInputSchema,
  type MaintenanceStatus,
} from './model'
import {
  createMaintenanceRequest,
  changeMaintenanceStatus,
  watchMaintenanceRequests,
  watchStatusHistory,
  debugMaintenance,
  type RequestRecord,
  type HistoryRecord,
} from './store'
import styles from './maintenance.module.css'

// The screen is kept here; validation and database calls stay in model.ts and store.ts.
export function MaintenancePage() {
  const { user, loading: authLoading } = useAuth()
  const { rows, loading, error, retry } = useMaintenanceRequests(user?.uid)
  const online = useOnlineStatus()
  const [filter, setFilter] = useState<MaintenanceStatus | 'ALL'>('ALL')
  if (authLoading) return <p role="status">Loading your account…</p>
  if (!user)
    return (
      <p>
        Please <Link href="/auth/signin">sign in</Link> to manage your requests.
      </p>
    )
  const visible = rows.filter((request) => filter === 'ALL' || request.status === filter)
  return (
    <div className={styles.board}>
      {/* The heading and counts describe requests, not live device health. */}
      <header className={styles.header}>
        <p className={styles.eyebrow}>Maintenance workspace</p>
        <h1>Pendant maintenance</h1>
        <p className={styles.muted}>
          Report a problem, track the work and keep a clear status history.
        </p>
        <p className={styles.hint}>
          Demo pendants P001–P005 · Only your requests are shown · Issues are entered manually.
        </p>
      </header>
      {!online && (
        <p role="status" className={styles.error}>
          You appear to be offline. Reconnect before creating or updating requests. Displayed
          records may be cached.
        </p>
      )}
      <div className={styles.metrics} aria-label="Request counts">
        {STATUSES.map((status) => (
          <div key={status} className={styles.metric}>
            <span>{STATUS_LABELS[status]}</span>
            <strong>
              {loading || error ? '—' : rows.filter((row) => row.status === status).length}
            </strong>
            <small>requests</small>
          </div>
        ))}
      </div>
      {/* Form on the left, saved requests and filters on the right. */}
      <div className={styles.columns}>
        <RequestForm key={user.uid} uid={user.uid} online={online} />
        <section className={styles.list} aria-labelledby="requests-title">
          <div className={styles.listHeading}>
            <div>
              <p className={styles.eyebrow}>Your workspace</p>
              <h2 id="requests-title">Maintenance requests</h2>
            </div>
            <label className={styles.filter}>
              Status
              <select
                aria-label="Filter by status"
                value={filter}
                onChange={(event) => setFilter(event.target.value as MaintenanceStatus | 'ALL')}
              >
                <option value="ALL">All statuses</option>
                {STATUSES.map((status) => (
                  <option value={status} key={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loading && (
            <div className={styles.empty} role="status">
              Loading requests…
            </div>
          )}
          {error && (
            <div className={styles.empty} role="alert">
              <p>{error}</p>
              <button className={styles.secondary} onClick={retry}>
                Try again
              </button>
            </div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div className={styles.empty}>
              <h3>{rows.length === 0 ? 'No requests yet' : 'No requests with this status'}</h3>
              <p>
                {rows.length === 0
                  ? 'Use the form to report your first pendant issue.'
                  : 'Choose another status to see your other requests.'}
              </p>
            </div>
          )}
          {!loading &&
            !error &&
            visible.map((request) => (
              <RequestCard
                key={`${user.uid}:${request.id}`}
                uid={user.uid}
                request={request}
                online={online}
              />
            ))}
        </section>
      </div>
    </div>
  )
}

// Labels and dates used by the screen.
const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
}
const PROBLEM_LABELS = {
  NO_SIGNAL: 'No signal',
  BATTERY: 'Battery problem',
  DAMAGE: 'Physical damage',
  OTHER: 'Other',
} as const

function formatTimestamp(value: { toDate: () => Date } | null | undefined): string {
  return value
    ? value.toDate().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Confirming time…'
}

function maintenanceError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code.includes('permission-denied'))
    return 'Access was denied. Check that you are signed in and the maintenance Firestore rules are deployed.'
  if (code.includes('unavailable') || code.includes('network'))
    return 'The connection is unavailable. Check your internet connection and try again.'
  if (code.includes('unauthenticated')) return 'Your session has expired. Please sign in again.'
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

// These listeners update the screen and stop when the account or request changes.
interface Feed<T> {
  key: string
  rows: T[]
  error: string | null
}

function useMaintenanceRequests(uid: string | undefined) {
  const [attempt, setAttempt] = useState(0)
  const key = `${uid ?? ''}:${attempt}`
  const [feed, setFeed] = useState<Feed<RequestRecord>>({ key: '', rows: [], error: null })
  useEffect(() => {
    if (!uid) return
    let active = true
    let unsubscribe = () => {}
    const failed = (error: unknown) => {
      debugMaintenance('Request list could not be loaded')
      if (active) setFeed({ key, rows: [], error: maintenanceError(error) })
    }
    try {
      unsubscribe = watchMaintenanceRequests(
        uid,
        (rows) => {
          if (active) setFeed({ key, rows, error: null })
        },
        failed
      )
    } catch (error) {
      // Setup failures are reported after this effect has finished, like listener errors.
      queueMicrotask(() => failed(error))
    }
    return () => {
      active = false
      unsubscribe()
    }
  }, [uid, key])
  // Hide the previous account or request while the new listener is loading.
  const current = feed.key === key
  return {
    rows: current ? feed.rows : [],
    error: current ? feed.error : null,
    loading: !!uid && !current,
    retry: () => setAttempt((value) => value + 1),
  }
}

function useStatusHistory(uid: string, requestId: string) {
  const [attempt, setAttempt] = useState(0)
  const key = `${uid}:${requestId}:${attempt}`
  const [feed, setFeed] = useState<Feed<HistoryRecord>>({ key: '', rows: [], error: null })
  useEffect(() => {
    let active = true
    let unsubscribe = () => {}
    const failed = (error: unknown) => {
      debugMaintenance('Status history could not be loaded')
      if (active) setFeed({ key, rows: [], error: maintenanceError(error) })
    }
    try {
      unsubscribe = watchStatusHistory(
        uid,
        requestId,
        (rows) => {
          if (active) setFeed({ key, rows, error: null })
        },
        failed
      )
    } catch (error) {
      queueMicrotask(() => failed(error))
    }
    return () => {
      active = false
      unsubscribe()
    }
  }, [uid, requestId, key])
  // Hide the previous account or request while the new listener is loading.
  const current = feed.key === key
  return {
    rows: current ? feed.rows : [],
    error: current ? feed.error : null,
    loading: !current,
    retry: () => setAttempt((value) => value + 1),
  }
}

function subscribeToConnection(changed: () => void) {
  window.addEventListener('online', changed)
  window.addEventListener('offline', changed)
  return () => {
    window.removeEventListener('online', changed)
    window.removeEventListener('offline', changed)
  }
}
function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine,
    () => true
  )
}

// The form creates a request; it does not choose the starting status.
function RequestForm({ uid, online }: { uid: string; online: boolean }) {
  const [pendantId, setPendantId] = useState('')
  const [problemType, setProblemType] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setSuccess(null)
    setError(null)
    // Check the form before calling the database.
    debugMaintenance('Checking the request form')
    const checked = requestInputSchema.safeParse({ pendantId, problemType, description })
    if (!checked.success) {
      debugMaintenance('Request form has validation errors')
      setErrors(checked.error.flatten().fieldErrors)
      return
    }
    setErrors({})
    if (!online) {
      setError('Reconnect to the internet before creating a request.')
      return
    }
    submitting.current = true
    setSaving(true)
    try {
      // Clear the form only after Firestore confirms both saved documents.
      await createMaintenanceRequest(uid, checked.data)
      setSuccess(`Request created for ${checked.data.pendantId}.`)
      setPendantId('')
      setProblemType('')
      setDescription('')
    } catch (caught) {
      setError(maintenanceError(caught))
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="new-request-title">
      <p className={styles.eyebrow}>Report an issue</p>
      <h2 id="new-request-title">New request</h2>
      <p className={styles.muted}>Choose a demo pendant and describe what needs attention.</p>
      <form onSubmit={submit} noValidate className={styles.form} aria-busy={saving}>
        <fieldset disabled={saving} className={styles.fields}>
          <div>
            <label htmlFor="pendant">Pendant</label>
            <select
              id="pendant"
              value={pendantId}
              onChange={(e) => setPendantId(e.target.value)}
              aria-invalid={!!errors.pendantId}
              aria-describedby={errors.pendantId ? 'pendant-error' : undefined}
              required
            >
              <option value="">Select a pendant</option>
              {PENDANT_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            {errors.pendantId && (
              <p id="pendant-error" className={styles.fieldError}>
                Select one of the five pendants.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="problem">Problem type</label>
            <select
              id="problem"
              value={problemType}
              onChange={(e) => setProblemType(e.target.value)}
              aria-invalid={!!errors.problemType}
              aria-describedby={errors.problemType ? 'problem-error' : undefined}
              required
            >
              <option value="">Select a problem</option>
              {PROBLEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROBLEM_LABELS[type]}
                </option>
              ))}
            </select>
            {errors.problemType && (
              <p id="problem-error" className={styles.fieldError}>
                Select a problem type.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={5}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, and what have you noticed?"
              aria-invalid={!!errors.description}
              aria-describedby="description-help description-error"
              required
            />
            <p id="description-help" className={styles.hint}>
              10–500 characters <span>{description.length}/500</span>
            </p>
            <p id="description-error" className={styles.fieldError}>
              {errors.description?.[0]}
            </p>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {success && (
          <p role="status" className={styles.success}>
            {success}
          </p>
        )}
        <button type="submit" className={styles.primary} disabled={saving || !online}>
          {saving ? 'Saving request…' : 'Create request'}
        </button>
        {saving && (
          <p className={styles.hint} role="status">
            Waiting for the database to confirm. Please keep this page open.
          </p>
        )}
        <p className={styles.hint}>
          New requests start as Open. You can start work from the request list.
        </p>
      </form>
    </section>
  )
}

// Each card shows one request and can open its saved history.
function History({ uid, requestId }: { uid: string; requestId: string }) {
  const { rows, loading, error, retry } = useStatusHistory(uid, requestId)
  return (
    <section aria-label="Status history" className={styles.history}>
      <h4>Status history</h4>
      {loading && <p role="status">Loading history…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={retry}>Try again</button>
        </div>
      )}
      {!loading && !error && rows.length === 0 && <p>No history entries available.</p>}
      <ol>
        {rows.map((entry) => (
          <li key={entry.id}>
            <strong>
              {entry.fromStatus ? `${STATUS_LABELS[entry.fromStatus]} to ` : 'Created as '}
              {STATUS_LABELS[entry.toStatus]}
            </strong>
            <p className={styles.hint}>
              {formatTimestamp(entry.changedAt)} ·{' '}
              {entry.changedBy === uid ? 'You' : entry.changedBy}
              {entry.pending ? ' · Saving…' : ''}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function RequestCard({
  request,
  uid,
  online,
}: {
  request: RequestRecord
  uid: string
  online: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const busy = useRef(false)
  const nextStatus =
    request.status === 'OPEN'
      ? 'IN_PROGRESS'
      : request.status === 'IN_PROGRESS'
        ? 'COMPLETED'
        : null
  async function advance() {
    if (!nextStatus || busy.current || request.pending || !online) return
    busy.current = true
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      // Pass the displayed status so an old screen cannot overwrite newer work.
      await changeMaintenanceStatus(uid, request.id, request.status, nextStatus)
      setSuccess(`Status changed to ${STATUS_LABELS[nextStatus]}.`)
    } catch (caught) {
      setError(maintenanceError(caught))
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return (
    <article className={styles.card} aria-busy={saving}>
      <div className={styles.cardHeading}>
        <h3>
          {request.pendantId}{' '}
          <span className={styles.muted}>· {PROBLEM_LABELS[request.problemType]}</span>
        </h3>
        <span className={styles.badge} data-status={request.status}>
          {STATUS_LABELS[request.status]}
        </span>
      </div>
      <p className={styles.description}>{request.description}</p>
      <p className={styles.hint}>
        Created {formatTimestamp(request.createdAt)}
        <br />
        Updated {formatTimestamp(request.updatedAt)}
      </p>
      <p className={styles.requestId}>Request {request.id}</p>
      {request.pending && (
        <p role="status" className={styles.hint}>
          Waiting for database confirmation…
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {success && (
        <p role="status" className={styles.success}>
          {success}
        </p>
      )}
      <div className={styles.actions}>
        {nextStatus && (
          <button
            className={styles.primary}
            onClick={advance}
            disabled={saving || request.pending || !online}
          >
            {saving ? 'Saving…' : nextStatus === 'IN_PROGRESS' ? 'Start work' : 'Complete request'}
          </button>
        )}
        <button
          className={styles.secondary}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide history' : 'View history'}
        </button>
      </div>
      {request.status === 'COMPLETED' && (
        <p className={styles.hint}>Completed requests cannot be changed.</p>
      )}
      {expanded && <History uid={uid} requestId={request.id} />}
    </article>
  )
}
