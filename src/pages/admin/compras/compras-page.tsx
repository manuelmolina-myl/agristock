import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/hooks/use-permissions'

import { RequisicionesTab } from './requisiciones-tab'
import { OcTab } from './oc-tab'
import { RecepcionesTab } from './recepciones-tab'
import { FacturasTab } from './facturas-tab'
import { NuevaRequisicionSheet } from './nueva-requisicion-sheet'

type TabKey = 'requisiciones' | 'cotizaciones' | 'oc' | 'recepciones' | 'facturas'

const TAB_OPTIONS: Array<{ value: TabKey; label: string }> = [
  { value: 'requisiciones', label: 'Requisiciones' },
  { value: 'oc',            label: 'Órdenes de compra' },
  { value: 'recepciones',   label: 'Recepciones' },
  { value: 'facturas',      label: 'Facturas' },
]

export default function ComprasPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { can } = usePermissions()

  const [tab, setTab] = useState<TabKey>(
    (params.get('tab') as TabKey) ?? 'requisiciones',
  )
  const [newOpen, setNewOpen] = useState(false)

  const handleTab = (value: string) => {
    setTab(value as TabKey)
    params.set('tab', value)
    setParams(params, { replace: true })
  }

  const canCreate = can('purchase.create')

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Compras"
        description="Requisiciones, cotizaciones, órdenes y recepciones — el ciclo completo de procurement."
        actions={
          canCreate && (
            <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" />
              Nueva requisición
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={handleTab} className="flex flex-col gap-4">
        <TabsList className="self-start">
          {TAB_OPTIONS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="requisiciones" className="m-0">
          <RequisicionesTab onOpenDetail={(id) => navigate(`/admin/compras/requisiciones/${id}`)} />
        </TabsContent>
        <TabsContent value="oc" className="m-0">
          <OcTab onOpenDetail={(id) => navigate(`/admin/compras/oc/${id}`)} />
        </TabsContent>
        <TabsContent value="recepciones" className="m-0">
          <RecepcionesTab />
        </TabsContent>
        <TabsContent value="facturas" className="m-0">
          <FacturasTab />
        </TabsContent>
      </Tabs>

      <NuevaRequisicionSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}
