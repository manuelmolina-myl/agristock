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
const CatalogosPage = lazy(() => import('@/pages/admin/catalogos-page'))
const ItemsPage = lazy(() => import('@/pages/admin/inventario/items-page'))
const ItemDetailPage = lazy(() => import('@/pages/admin/inventario/item-detail-page'))
const ItemFormPage = lazy(() => import('@/pages/admin/inventario/item-form-page'))
const FxRatesPage = lazy(() => import('@/pages/admin/fx-rates-page'))
const EntradasPage = lazy(() => import('@/pages/admin/entradas/entradas-page'))
const NuevaEntradaPage = lazy(() => import('@/pages/admin/entradas/nueva-entrada-page'))
const SalidasPage = lazy(() => import('@/pages/admin/salidas/salidas-page'))
const NuevaSalidaPage = lazy(() => import('@/pages/admin/salidas/nueva-salida-page'))
const DieselPage = lazy(() => import('@/pages/admin/diesel/diesel-page'))
const CargaDieselPage = lazy(() => import('@/pages/admin/diesel/carga-diesel-page'))
const LotesPage = lazy(() => import('@/pages/admin/lotes/lotes-page'))
const LoteDetailPage = lazy(() => import('@/pages/admin/lotes/lote-detail-page'))
const EquiposPage = lazy(() => import('@/pages/admin/equipos/equipos-page'))
const EquipoDetailPage = lazy(() => import('@/pages/admin/equipos/equipo-detail-page'))
const AuditoriaPage = lazy(() => import('@/pages/admin/auditoria/auditoria-page'))
const ReportesPage = lazy(() => import('@/pages/admin/reportes/reportes-page'))
const ReportViewerPage = lazy(() => import('@/pages/admin/reportes/report-viewer-page'))
const CierreTemporadaPage = lazy(() => import('@/pages/admin/cierre-temporada-page'))

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
        <Route path="/" element={<RoleRedirect />} />

        {/* Admin routes (Super Admin) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="inventario" element={<ItemsPage />} />
          <Route path="inventario/nuevo" element={<ItemFormPage />} />
          <Route path="inventario/:id" element={<ItemDetailPage />} />
          <Route path="inventario/:id/editar" element={<ItemFormPage />} />
          <Route path="entradas" element={<EntradasPage />} />
          <Route path="entradas/nueva" element={<NuevaEntradaPage />} />
          <Route path="salidas" element={<SalidasPage />} />
          <Route path="salidas/nueva" element={<NuevaSalidaPage />} />
          <Route path="diesel" element={<DieselPage />} />
          <Route path="diesel/cargar" element={<CargaDieselPage />} />
          <Route path="lotes" element={<LotesPage />} />
          <Route path="lotes/:id" element={<LoteDetailPage />} />
          <Route path="equipos" element={<EquiposPage />} />
          <Route path="equipos/:id" element={<EquipoDetailPage />} />
          <Route path="reportes" element={<ReportesPage />} />
          <Route path="reportes/:slug" element={<ReportViewerPage />} />
          <Route path="auditoria" element={<AuditoriaPage />} />
          <Route path="configuracion" element={<CatalogosPage />} />
          <Route path="tipo-cambio" element={<FxRatesPage />} />
          <Route path="cierre-temporada" element={<CierreTemporadaPage />} />
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
          <Route path="inventario" element={<ItemsPage />} />
          <Route path="inventario/nuevo" element={<ItemFormPage />} />
          <Route path="inventario/:id" element={<ItemDetailPage />} />
          <Route path="inventario/:id/editar" element={<ItemFormPage />} />
          <Route path="entradas" element={<EntradasPage />} />
          <Route path="entradas/nueva" element={<NuevaEntradaPage />} />
          <Route path="salidas" element={<SalidasPage />} />
          <Route path="salidas/nueva" element={<NuevaSalidaPage />} />
          <Route path="diesel" element={<DieselPage />} />
          <Route path="diesel/cargar" element={<CargaDieselPage />} />
          <Route path="lotes" element={<LotesPage />} />
          <Route path="lotes/:id" element={<LoteDetailPage />} />
          <Route path="equipos" element={<EquiposPage />} />
          <Route path="equipos/:id" element={<EquipoDetailPage />} />
          <Route path="reportes" element={<ReportesPage />} />
          <Route path="reportes/:slug" element={<ReportViewerPage />} />
          <Route path="auditoria" element={<AuditoriaPage />} />
          <Route path="configuracion" element={<CatalogosPage />} />
          <Route path="tipo-cambio" element={<FxRatesPage />} />
          <Route path="cierre-temporada" element={<CierreTemporadaPage />} />
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
          <Route path="inventario" element={<ItemsPage />} />
          <Route path="inventario/:id" element={<ItemDetailPage />} />
          <Route path="entradas" element={<EntradasPage />} />
          <Route path="entradas/nueva" element={<NuevaEntradaPage />} />
          <Route path="salidas" element={<SalidasPage />} />
          <Route path="salidas/nueva" element={<NuevaSalidaPage />} />
          <Route path="diesel" element={<DieselPage />} />
          <Route path="diesel/cargar" element={<CargaDieselPage />} />
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
