'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { STATUSES, type MaintenanceStatus } from './model'
import { STATUS_LABELS } from './presentation'
import { useMaintenanceRequests, useOnlineStatus } from './useMaintenance'
import { RequestForm } from './RequestForm'
import { RequestCard } from './RequestCard'
import styles from './maintenance.module.css'

export function MaintenanceBoard() {
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
