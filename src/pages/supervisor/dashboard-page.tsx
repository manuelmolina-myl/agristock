import { ClipboardList } from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Card, CardContent } from '@/components/ui/card'

export function SupervisorDashboardPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Mis solicitudes"
        description="Solicitudes de materiales e insumos pendientes de tu aprobación"
      />

      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="No tienes solicitudes pendientes"
            description="Las solicitudes de salida que requieran tu aprobación aparecerán aquí."
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default SupervisorDashboardPage
