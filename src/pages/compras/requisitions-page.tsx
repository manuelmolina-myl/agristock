import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/hooks/use-permissions'

import { RequisicionesTab } from '@/pages/admin/compras/requisiciones-tab'
import { NuevaRequisicionSheet } from '@/pages/admin/compras/nueva-requisicion-sheet'

export default function RequisitionsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { can } = usePermissions()

  const [newOpen, setNewOpen] = useState(params.get('new') === '1')

  // Sync the ?new=1 query param with dialog state so deep-links open the form.
  useEffect(() => {
    if (params.get('new') === '1' && !newOpen) setNewOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const handleCloseNew = () => {
    setNewOpen(false)
    if (params.get('new')) {
      params.delete('new')
      setParams(params, { replace: true })
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Solicitudes de compra"
        description="Captura de requisiciones por área. Pasan por aprobación y luego a cotización."
        actions={
          can('purchase.create') && (
            <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" />
              Nueva solicitud
            </Button>
          )
        }
      />

      <RequisicionesTab onOpenDetail={(id) => navigate(`/compras/requisiciones/${id}`)} />

      <NuevaRequisicionSheet open={newOpen} onClose={handleCloseNew} />
    </div>
  )
}
