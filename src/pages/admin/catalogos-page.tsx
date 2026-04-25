import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/custom/page-header'
import { CategoriesTab } from './catalogos/categories-tab'
import { UnitsTab } from './catalogos/units-tab'
import { SuppliersTab } from './catalogos/suppliers-tab'
import { WarehousesTab } from './catalogos/warehouses-tab'
import { EmployeesTab } from './catalogos/employees-tab'
import { EquipmentTab } from './catalogos/equipment-tab'
import { LotsTab } from './catalogos/lots-tab'

const TABS = [
  { value: 'categories', label: 'Categorías', component: <CategoriesTab /> },
  { value: 'units', label: 'Unidades', component: <UnitsTab /> },
  { value: 'suppliers', label: 'Proveedores', component: <SuppliersTab /> },
  { value: 'warehouses', label: 'Almacenes', component: <WarehousesTab /> },
  { value: 'employees', label: 'Empleados', component: <EmployeesTab /> },
  { value: 'equipment', label: 'Equipos', component: <EquipmentTab /> },
  { value: 'lots', label: 'Lotes', component: <LotsTab /> },
]

export default function CatalogosPage() {
  const [active, setActive] = useState('categories')

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Catálogos"
        description="Administra las entidades de referencia del sistema."
      />

      <Tabs value={active} onValueChange={setActive}>
        {/* Mobile: select dropdown */}
        <Select value={active} onValueChange={(v) => v && setActive(v)}>
          <SelectTrigger className="sm:hidden">
            <SelectValue>{TABS.find((t) => t.value === active)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TABS.map((tab) => (
              <SelectItem key={tab.value} value={tab.value}>
                {tab.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Desktop: tab pills */}
        <TabsList className="hidden sm:inline-flex h-8 gap-0.5 bg-muted/50">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="h-7 text-xs px-3">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {tab.component}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
