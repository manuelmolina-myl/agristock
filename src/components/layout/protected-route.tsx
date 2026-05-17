import { Navigate, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { ROLE_ROUTES_NEW } from '@/lib/constants'
import type { UserRoleEnum } from '@/lib/database.types'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Full-screen loading skeleton ────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex h-screen w-full">
      {/* Sidebar skeleton */}
      <div className="hidden w-64 shrink-0 border-r border-border md:flex flex-col gap-2 p-4">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <div className="mt-4 space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Skeleton className="h-6 w-6 rounded-md" />
          <Skeleton className="h-4 w-32 rounded" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-7 w-48 rounded-lg" />
            <Skeleton className="size-7 rounded-full" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-48 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

// ─── ProtectedRoute ───────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  /**
   * Roles permitted to access this route. The user matches if ANY of their
   * granted roles (from user_roles) is in this list. Backed by the new
   * UserRoleEnum from 013_user_roles_table.sql.
   */
  allowedRoles?: UserRoleEnum[]
  children?: ReactNode
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, profile, roles, primaryRole, isLoading } = useAuth()

  // Still initialising auth
  if (isLoading) {
    return <LoadingSkeleton />
  }

  // Not authenticated → send to login
  if (!user || !profile) {
    return <Navigate to="/login" replace />
  }

  // Authenticated but wrong role → redirect to their correct route
  if (allowedRoles && !allowedRoles.some((r) => roles.includes(r))) {
    const correctRoute = primaryRole ? (ROLE_ROUTES_NEW[primaryRole] ?? '/login') : '/login'
    return <Navigate to={correctRoute} replace />
  }

  // All good — render children or nested routes via <Outlet />
  return children ? <>{children}</> : <Outlet />
}
