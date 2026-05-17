import { describe, it, expect } from 'vitest'
import { formatSupabaseError } from './errors'

/**
 * Smoke test for `formatSupabaseError`.
 *
 * These three cases prove the helper unwraps every shape we see in the wild:
 *   1. A plain `Error` instance (network / runtime failure).
 *   2. A PostgREST shape — assert the friendly Spanish hint for unique-violation 23505.
 *   3. An unrecognised value — falls back to "Sin detalles".
 *
 * If any of these break, every toast in the app is impacted, so this smoke
 * test is also the canary for the larger Vitest pipeline.
 */
describe('formatSupabaseError', () => {
  it('unwraps a plain Error to { title, description: error.message }', () => {
    const result = formatSupabaseError(new Error('Network is down'))
    expect(result.title).toBe('Algo salió mal')
    expect(result.description).toBe('Network is down')
  })

  it('maps PostgREST code 23505 to the Spanish unique-violation hint', () => {
    const result = formatSupabaseError({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: null,
      hint: null,
    })
    expect(result.description).toContain('Ya existe un registro con esa información')
  })

  it('returns "Sin detalles" for unknown shapes', () => {
    const result = formatSupabaseError(42)
    expect(result.description).toBe('Sin detalles')
  })
})
