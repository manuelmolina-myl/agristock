import { PackagePlus, PackageMinus, ArrowLeftRight, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/custom/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function AlmacenistaDashboardPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate('/almacenista/entradas/nueva')}
          className="group flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-card-foreground ring-1 ring-foreground/5 transition-all hover:border-primary/40 hover:bg-primary/5 hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <PackagePlus className="size-5" strokeWidth={1.75} />
          </div>
          <span className="text-sm font-medium">+ Nueva entrada</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/almacenista/salidas/nueva')}
          className="group flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-card-foreground ring-1 ring-foreground/5 transition-all hover:border-destructive/40 hover:bg-destructive/5 hover:ring-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-colors group-hover:bg-destructive/15">
            <PackageMinus className="size-5" strokeWidth={1.75} />
          </div>
          <span className="text-sm font-medium">+ Nueva salida</span>
        </button>
      </div>

      {/* Movimientos del día */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ArrowLeftRight className="size-4 text-muted-foreground" />
            Movimientos del día
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <EmptyState
            title="Sin movimientos hoy"
            description="Los movimientos registrados hoy aparecerán aquí."
          />
        </CardContent>
      </Card>

      {/* Alertas de stock bajo */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 text-muted-foreground" />
            Alertas de stock bajo
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <EmptyState
            title="Sin alertas activas"
            description="Los artículos por debajo del punto de reorden aparecerán aquí."
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default AlmacenistaDashboardPage
