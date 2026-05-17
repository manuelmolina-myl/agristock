/**
 * Local read-state for notifications.
 *
 * MVP approach: we track which notifications the current user has acknowledged
 * by storing their `link_path` (the unique route to the underlying resource)
 * in localStorage, scoped per user.  This avoids a server round-trip and lets
 * the bell badge react instantly — at the cost of read-state not syncing
 * across devices.  When we ship migration 036 we can swap the backing store
 * without changing the consumer API.
 */
import { useCallback, useEffect, useState } from 'react'

function storageKey(userId: string | undefined): string | null {
  if (!userId) return null
  return `agristock:notification-reads:${userId}`
}

function readSet(userId: string | undefined): Set<string> {
  const key = storageKey(userId)
  if (!key || typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeSet(userId: string | undefined, set: Set<string>): void {
  const key = storageKey(userId)
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)))
    window.dispatchEvent(new CustomEvent('agristock:notification-reads-changed', { detail: { userId } }))
  } catch {
    /* quota or disabled storage — silent fallback */
  }
}

/** React hook subscribing to the read set; rerenders on cross-component changes. */
export function useNotificationReads(userId: string | undefined) {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!userId) return
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId?: string } | undefined
      if (!detail?.userId || detail.userId === userId) setVersion((v) => v + 1)
    }
    window.addEventListener('agristock:notification-reads-changed', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('agristock:notification-reads-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [userId])

  // Re-read every render — small set, negligible cost, ensures consistency.
  // The `version` dependency forces a re-read whenever a sibling component
  // mutates the set; the value itself is unused.
  void version
  const set = readSet(userId)

  const markRead = useCallback(
    (linkPath: string) => {
      const next = readSet(userId)
      next.add(linkPath)
      writeSet(userId, next)
    },
    [userId],
  )

  const markUnread = useCallback(
    (linkPath: string) => {
      const next = readSet(userId)
      next.delete(linkPath)
      writeSet(userId, next)
    },
    [userId],
  )

  const markAllRead = useCallback(
    (linkPaths: string[]) => {
      const next = readSet(userId)
      linkPaths.forEach((p) => next.add(p))
      writeSet(userId, next)
    },
    [userId],
  )

  const clearAll = useCallback(() => {
    writeSet(userId, new Set())
  }, [userId])

  return { reads: set, markRead, markUnread, markAllRead, clearAll }
}
