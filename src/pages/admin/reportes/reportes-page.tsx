import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Package,
  Truck,
  MapPin,
  Wrench,
  Fuel,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Lock,
  Users,
  DollarSign,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'

// ─── Report registry ──────────────────────────────────────────────────────────

interface ReportCard {
  slug: string
  title: string
  description: string
  icon: LucideIcon
}

const REPORTS: ReportCard[] = [
  {
    slug: 'kardex',
    title: 'Kardex General',
    description: 'Historial completo de movimientos por ítem con saldo acumulado.',
    icon: FileText,
  },
  {
    slug: 'existencias',
    title: 'Existencias Valuadas',
    description: 'Inventario actual valorizado a costo promedio en MXN y USD.',
    icon: Package,
  },
  {
    slug: 'entradas-proveedor',
    title: 'Entradas por Proveedor',
    description: 'Resumen de compras y entradas agrupadas por proveedor.',
    icon: Truck,
  },
  {
    slug: 'salidas-lote',
    title: 'Salidas por Lote',
    description: 'Consumo de materiales por lote agrícola y costo por hectárea.',
    icon: MapPin,
  },
  {
    slug: 'salidas-equipo',
    title: 'Salidas por Equipo',
    description: 'Insumos y refacciones consumidos por equipo o maquinaria.',
    icon: Wrench,
  },
  {
    slug: 'consumo-diesel',
    title: 'Consumo Diésel',
    description: 'Registro de cargas de diésel con litros, costo y equipo.',
    icon: Fuel,
  },
  {
    slug: 'rotacion',
    title: 'Rotación de Inventario',
    description: 'Índice de rotación y días de inventario por ítem.',
    icon: RefreshCw,
  },
  {
    slug: 'sin-movimiento',
    title: 'Ítems sin Movimiento',
    description: 'Ítems que no han tenido movimiento en el período seleccionado.',
    icon: AlertCircle,
  },
  {
    slug: 'variacion-precios',
    title: 'Variación de Precios',
    description: 'Comparativa de precios de compra en el tiempo por ítem.',
    icon: TrendingUp,
  },
  {
    slug: 'cierre-temporada',
    title: 'Cierre de Temporada',
    description: 'Resumen ejecutivo de inventarios y costos al cierre de temporada.',
    icon: Lock,
  },
  {
    slug: 'auditoria-usuario',
    title: 'Auditoría por Usuario',
    description: 'Registro de acciones y movimientos realizados por cada usuario.',
    icon: Users,
  },
  {
    slug: 'conversiones-moneda',
    title: 'Conversiones de Moneda',
    description: 'Historial de tipos de cambio y conversiones MXN/USD aplicadas.',
    icon: DollarSign,
  },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReportesPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Reportes"
        description="Centro de reportes y análisis"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => {
          const Icon = report.icon
          return (
            <Card
              key={report.slug}
              className="group flex flex-col transition-shadow hover:shadow-md dark:hover:shadow-none dark:hover:border-muted-foreground/30"
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm font-semibold leading-snug">
                    {report.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-0">
                <CardDescription className="text-xs leading-relaxed">
                  {report.description}
                </CardDescription>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`/admin/reportes/${report.slug}`)}
                >
                  Generar
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
