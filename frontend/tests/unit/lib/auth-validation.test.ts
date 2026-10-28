// Check that the upgraded resolver still gives the login and signup forms field errors.
import { describe, expect, it } from 'vitest'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, signupSchema } from '@/lib/validations/auth'

const options = { fields: {}, shouldUseNativeValidation: false }

describe('auth forms with the patched Zod resolver', () => {
  it('returns field errors instead of throwing for invalid login details', async () => {
    const result = await zodResolver(loginSchema)(
      { email: 'invalid', password: '' },
      undefined,
      options
    )
    expect(result.errors.email?.message).toBe('Please enter a valid email address')
    expect(result.errors.password?.message).toBe('Password is required')
  })
  it('keeps password confirmation errors on the confirmation field', async () => {
    const result = await zodResolver(signupSchema)(
      {
        displayName: 'Demo User',
        email: 'demo@example.com',
        password: 'Example123',
        confirmPassword: 'Different123',
      },
      undefined,
      options
    )
    expect(result.errors.confirmPassword?.message).toBe('Passwords do not match')
  })
  it('returns validated login values for a valid form', async () => {
    const input = { email: 'demo@example.com', password: 'Example123' }
    const result = await zodResolver(loginSchema)(input, undefined, options)
    expect(result.errors).toEqual({})
    expect(result.values).toEqual(input)
  })
})
