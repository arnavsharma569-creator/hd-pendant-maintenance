import { describe, expect, it } from 'vitest'
import { historyId, isAllowedTransition, requestInputSchema } from '@/features/maintenance/model'

describe('maintenance input', () => {
  const valid = {
    pendantId: 'P001',
    problemType: 'NO_SIGNAL',
    description: 'Pendant stopped reporting.',
  }
  it('accepts and trims a valid description', () => {
    expect(
      requestInputSchema.parse({ ...valid, description: `  ${valid.description}  ` }).description
    ).toBe(valid.description)
  })
  it.each([
    { pendantId: 'P006' },
    { problemType: 'UNSUPPORTED' },
    { description: 'short' },
    { description: ' '.repeat(30) },
    { description: 'a'.repeat(501) },
    { status: 'COMPLETED' },
  ])('rejects invalid input %j', (patch) => {
    expect(requestInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false)
  })
})

describe('maintenance transitions', () => {
  it('allows only the two forward transitions', () => {
    const statuses = ['OPEN', 'IN_PROGRESS', 'COMPLETED'] as const
    for (const from of statuses)
      for (const to of statuses) {
        expect(isAllowedTransition(from, to)).toBe(
          (from === 'OPEN' && to === 'IN_PROGRESS') ||
            (from === 'IN_PROGRESS' && to === 'COMPLETED')
        )
      }
  })
  it('uses a separate deterministic history ID per request and status', () => {
    expect(historyId('abc', 'OPEN')).toBe('abc_OPEN')
    expect(historyId('abc', 'IN_PROGRESS')).not.toBe(historyId('abc', 'OPEN'))
    expect(historyId('abc', 'OPEN')).not.toBe(historyId('def', 'OPEN'))
  })
})
