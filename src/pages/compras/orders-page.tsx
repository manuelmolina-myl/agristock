import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/custom/page-header'
import { OcTab } from '@/pages/admin/compras/oc-tab'

export default function OrdersPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Órdenes de compra"
        description="OCs emitidas a proveedores. Recepciones y conciliación de facturas se ligan aquí."
      />
      <OcTab onOpenDetail={(id) => navigate(`/compras/ordenes/${id}`)} />
    </div>
  )
}
