'use client'

import { useRef, useState, type FormEvent } from 'react'
import { PENDANT_IDS, PROBLEM_TYPES, requestInputSchema } from './model'
import { createMaintenanceRequest } from './store'
import { maintenanceError, PROBLEM_LABELS } from './presentation'
import styles from './maintenance.module.css'

export function RequestForm({ uid, online }: { uid: string; online: boolean }) {
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
    const checked = requestInputSchema.safeParse({ pendantId, problemType, description })
    if (!checked.success) {
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
