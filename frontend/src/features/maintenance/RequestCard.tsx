'use client'

import { useRef, useState } from 'react'
import { changeMaintenanceStatus, type RequestRecord } from './store'
import { formatTimestamp, maintenanceError, PROBLEM_LABELS, STATUS_LABELS } from './presentation'
import { useStatusHistory } from './useMaintenance'
import styles from './maintenance.module.css'

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

export function RequestCard({
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
