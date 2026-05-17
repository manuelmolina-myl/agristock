import { PageHeader } from '@/components/custom/page-header'
import { RecepcionesTab } from '@/pages/admin/compras/recepciones-tab'

export default function ReceptionsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Recepciones"
        description="Material recibido contra una OC. Cada recepción genera el movimiento de inventario y actualiza el costo promedio."
      />
      <RecepcionesTab />
    </div>
  )
}
