import {
  DollarSign,
  ArrowLeftRight,
  AlertTriangle,
  Fuel,
  LayoutDashboard,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface KpiCardProps {
  label: string
  value: string
  icon: React.ReactNode
  description?: string
}

function KpiCard({ label, value, icon, description }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="font-heading text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Dashboard"
        description="Resumen general de operaciones"
      />

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Valor de inventario"
          value="$0.00"
          icon={<DollarSign className="size-4" />}
          description="MXN · temporada activa"
        />
        <KpiCard
          label="Movimientos hoy"
          value="0"
          icon={<ArrowLeftRight className="size-4" />}
          description="Entradas y salidas"
        />
        <KpiCard
          label="Bajo punto de reorden"
          value="0 artículos"
          icon={<AlertTriangle className="size-4" />}
          description="Requieren atención"
        />
        <KpiCard
          label="Diésel mes actual"
          value="0 L"
          icon={<Fuel className="size-4" />}
          description="Consumo acumulado"
        />
      </div>

      {/* Empty state */}
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<LayoutDashboard className="size-5" />}
            title="Sin datos aún"
            description="Los datos aparecerán cuando registres movimientos en el sistema."
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminDashboardPage
