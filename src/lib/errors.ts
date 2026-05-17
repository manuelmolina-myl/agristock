/**
 * Centralized helper to surface Supabase / PostgREST errors in toasts.
 *
 * Supabase rejects mutations with a plain object `{ message, details, hint, code }`
 * — NOT an `Error` instance — so the common pattern
 *   `e instanceof Error ? e.message : 'Error'`
 * falls back to a generic message and hides the real cause.  This helper
 * unwraps every shape we've seen in the wild and returns
 *   { title, description }
 * ready to pass to `toast.error(title, { description })`.
 */
import type { PostgrestError } from '@supabase/supabase-js'

export interface FormattedError {
  title: string
  description: string
}

/** Stable mapping of common Postgres error codes → friendlier Spanish copy. */
const CODE_HINTS: Record<string, string> = {
  '23505': 'Ya existe un registro con esa información',
  '23503': 'Referencia a un registro que no existe',
  '23514': 'Los datos no cumplen la validación',
  '23502': 'Falta un campo obligatorio',
  '42501': 'No tienes permiso para esta acción',
  '42883': 'Función no encontrada en la base de datos',
  '22P02': 'Tipo de dato inválido',
  '40001': 'Conflicto concurrente — vuelve a intentar',
  'P0001': 'Validación de la aplicación',
  'P0002': 'Registro no encontrado',
  PGRST116: 'Sin registros que coincidan',
}

export function formatSupabaseError(
  e: unknown,
  fallbackTitle = 'Algo salió mal',
): FormattedError {
  // Plain Error instance (network, runtime).
  if (e instanceof Error) {
    return { title: fallbackTitle, description: e.message }
  }

  // PostgREST / Supabase shape: { code, message, details, hint }.
  if (e && typeof e === 'object') {
    const err = e as Partial<PostgrestError> & {
      error?: string
      msg?: string
      error_description?: string
    }

    const code     = err.code
    const message  = err.message || err.msg || err.error || err.error_description
    const details  = err.details
    const hint     = err.hint
    const codeHint = code ? CODE_HINTS[code] : undefined

    // Compose: prefer the most-specific human text we can assemble.
    const description = [codeHint, message, details, hint]
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .join(' · ')

    const codeBadge = code ? ` [${code}]` : ''
    return {
      title: fallbackTitle,
      description: description ? `${description}${codeBadge}` : `Sin detalles${codeBadge}`,
    }
  }

  return { title: fallbackTitle, description: 'Sin detalles' }
}

/**
 * Convenience wrapper for the common case:
 *   onError: (e) => toastSupabaseError(e, 'No se pudo guardar')
 * — keeps call sites short and consistent.
 */
export function toastSupabaseError(
  toastFn: (title: string, opts: { description: string }) => void,
  e: unknown,
  fallbackTitle = 'Algo salió mal',
): void {
  const { title, description } = formatSupabaseError(e, fallbackTitle)
  toastFn(title, { description })
  // eslint-disable-next-line no-console
  console.error(`[${title}]`, e)
}
