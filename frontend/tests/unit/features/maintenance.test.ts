import { describe, expect, it } from 'vitest'
import { isAllowedTransition, requestInputSchema } from '@/features/maintenance/model'

const validRequest = {
  pendantId: 'P001',
  problemType: 'NO_SIGNAL',
  description: 'Pendant stopped reporting.',
}

describe('maintenance input', () => {
  it('accepts a valid request and trims the description', () => {
    const result = requestInputSchema.parse({
      ...validRequest,
      description: '  Pendant stopped reporting.  ',
    })
    expect(result.description).toBe('Pendant stopped reporting.')
  })

  it('rejects a pendant or problem type outside the dropdown choices', () => {
    expect(requestInputSchema.safeParse({ ...validRequest, pendantId: 'P006' }).success).toBe(false)
    expect(requestInputSchema.safeParse({ ...validRequest, problemType: 'UNKNOWN' }).success).toBe(
      false
    )
  })

  it('rejects descriptions that are blank, too short or too long', () => {
    expect(
      requestInputSchema.safeParse({ ...validRequest, description: ' '.repeat(30) }).success
    ).toBe(false)
    expect(requestInputSchema.safeParse({ ...validRequest, description: 'short' }).success).toBe(
      false
    )
    expect(
      requestInputSchema.safeParse({ ...validRequest, description: 'a'.repeat(501) }).success
    ).toBe(false)
  })

  it('rejects a status supplied as part of the request form', () => {
    // New requests must start as OPEN; the form cannot choose COMPLETED.
    expect(requestInputSchema.safeParse({ ...validRequest, status: 'COMPLETED' }).success).toBe(
      false
    )
  })
})

describe('maintenance statuses', () => {
  it('allows only OPEN to IN_PROGRESS, then IN_PROGRESS to COMPLETED', () => {
    expect(isAllowedTransition('OPEN', 'IN_PROGRESS')).toBe(true)
    expect(isAllowedTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
    expect(isAllowedTransition('OPEN', 'COMPLETED')).toBe(false)
    expect(isAllowedTransition('IN_PROGRESS', 'OPEN')).toBe(false)
    expect(isAllowedTransition('COMPLETED', 'OPEN')).toBe(false)
    expect(isAllowedTransition('COMPLETED', 'IN_PROGRESS')).toBe(false)
    expect(isAllowedTransition('OPEN', 'OPEN')).toBe(false)
    expect(isAllowedTransition('IN_PROGRESS', 'IN_PROGRESS')).toBe(false)
    expect(isAllowedTransition('COMPLETED', 'COMPLETED')).toBe(false)
  })
})
