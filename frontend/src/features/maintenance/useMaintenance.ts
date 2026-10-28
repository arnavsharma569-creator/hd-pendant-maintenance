'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { maintenanceError } from './presentation'
import {
  watchMaintenanceRequests,
  watchStatusHistory,
  type HistoryRecord,
  type RequestRecord,
} from './store'

interface Feed<T> {
  key: string
  rows: T[]
  error: string | null
}

export function useMaintenanceRequests(uid: string | undefined) {
  const [attempt, setAttempt] = useState(0)
  const key = `${uid ?? ''}:${attempt}`
  const [feed, setFeed] = useState<Feed<RequestRecord>>({ key: '', rows: [], error: null })
  useEffect(() => {
    if (!uid) return
    let active = true
    let unsubscribe = () => {}
    const failed = (error: unknown) => {
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
  const current = feed.key === key
  return {
    rows: current ? feed.rows : [],
    error: current ? feed.error : null,
    loading: !!uid && !current,
    retry: () => setAttempt((value) => value + 1),
  }
}

export function useStatusHistory(uid: string, requestId: string) {
  const [attempt, setAttempt] = useState(0)
  const key = `${uid}:${requestId}:${attempt}`
  const [feed, setFeed] = useState<Feed<HistoryRecord>>({ key: '', rows: [], error: null })
  useEffect(() => {
    let active = true
    let unsubscribe = () => {}
    const failed = (error: unknown) => {
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
export function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine,
    () => true
  )
}
