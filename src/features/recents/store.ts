/**
 * Recientes — per-user localStorage tracker of recently visited entities.
 *
 * Captures the last N items/equipment/suppliers/requisitions/work-orders the
 * user opened, so the command palette can surface them as "Recientes" before
 * search results.  Stored per-user under a single key; max 24 entries with
 * LRU semantics.
 */
import { useEffect, useState } from 'react'

export type RecentKind = 'item' | 'supplier' | 'equipment' | 'requisition' | 'work_order'

export interface RecentEntry {
  kind: RecentKind
  id: string
  label: string
  sublabel?: string | null
  linkPath: string
  ts: number
}

const MAX_ENTRIES = 24

function key(userId: string | undefined): string | null {
  if (!userId) return null
  return `agristock:recents:${userId}`
}

function read(userId: string | undefined): RecentEntry[] {
  const k = key(userId)
  if (!k || typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(k)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((v): v is RecentEntry =>
      !!v && typeof v === 'object' && typeof (v as RecentEntry).id === 'string'
    )
  } catch {
    return []
  }
}

function write(userId: string | undefined, list: RecentEntry[]): void {
  const k = key(userId)
  if (!k || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(k, JSON.stringify(list.slice(0, MAX_ENTRIES)))
    window.dispatchEvent(new CustomEvent('agristock:recents-changed', { detail: { userId } }))
  } catch {
    /* swallow quota errors */
  }
}

export function recordRecent(userId: string | undefined, entry: Omit<RecentEntry, 'ts'>): void {
  if (!userId) return
  const existing = read(userId)
  const without = existing.filter((e) => !(e.kind === entry.kind && e.id === entry.id))
  const next: RecentEntry[] = [{ ...entry, ts: Date.now() }, ...without]
  write(userId, next)
}

export function useRecents(userId: string | undefined): RecentEntry[] {
  const [list, setList] = useState<RecentEntry[]>(() => read(userId))

  useEffect(() => {
    setList(read(userId))
    if (!userId) return
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId?: string } | undefined
      if (!detail?.userId || detail.userId === userId) setList(read(userId))
    }
    window.addEventListener('agristock:recents-changed', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('agristock:recents-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [userId])

  return list
}

/**
 * Side-effect hook for detail pages.  Call once with the entity payload —
 * it's idempotent within a render and only writes when the inputs change.
 */
export function useRecordRecent(
  userId: string | undefined,
  entry: Omit<RecentEntry, 'ts'> | null,
): void {
  useEffect(() => {
    if (!userId || !entry) return
    recordRecent(userId, entry)
  }, [userId, entry?.kind, entry?.id, entry?.label, entry?.sublabel, entry?.linkPath])
}
