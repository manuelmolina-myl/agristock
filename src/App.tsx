import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { ROLE_ROUTES } from '@/lib/constants'
import type { UserRole } from '@/lib/database.types'

// Layout
const AppLayout = lazy(() => import('@/components/layout/app-layout'))

// Auth
const LoginPage = lazy(() => import('@/pages/auth/login-page'))

// Admin (Super Admin)
const AdminDashboard = lazy(() => import('@/pages/admin/dashboard-page'))

// Gerente
const GerenteDashboard = lazy(() => import('@/pages/gerente/dashboard-page'))

// Almacenista
const AlmacenistaDashboard = lazy(() => import('@/pages/almacenista/dashboard-page'))

// Supervisor
const SupervisorDashboard = lazy(() => import('@/pages/supervisor/dashboard-page'))

function LoadingFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    </div>
  )
}

function RoleRedirect() {
  const { profile, isLoading } = useAuth()

  if (isLoading) return <LoadingFallback />

  if (!profile) return <Navigate to="/login" replace />

  const route = ROLE_ROUTES[profile.role as UserRole]
  return <Navigate to={route} replace />
}

function ProtectedRoute({ allowedRoles, children }: { allowedRoles: UserRole[]; children: React.ReactNode }) {
  const { user, profile, isLoading } = useAuth()

  if (isLoading) return <LoadingFallback />

  if (!user || !profile) return <Navigate to="/login" replace />

  if (!allowedRoles.includes(profile.role as UserRole)) {
    const route = ROLE_ROUTES[profile.role as UserRole]
    return <Navigate to={route} replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Redirect root to role dashboard */}
        <Route path="/" element={<RoleRedirect />} />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
        </Route>

        {/* Gerente routes */}
        <Route
          path="/gerente"
          element={
            <ProtectedRoute allowedRoles={['gerente']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<GerenteDashboard />} />
        </Route>

        {/* Almacenista routes */}
        <Route
          path="/almacenista"
          element={
            <ProtectedRoute allowedRoles={['almacenista']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AlmacenistaDashboard />} />
        </Route>

        {/* Supervisor routes */}
        <Route
          path="/supervisor"
          element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<SupervisorDashboard />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
