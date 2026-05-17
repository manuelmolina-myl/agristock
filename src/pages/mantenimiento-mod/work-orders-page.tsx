// The work-orders kanban is already implemented in /pages/admin/mantenimiento.
// This wrapper just re-exports it so we can register it under the new
// /mantenimiento/ordenes path while we phase out the /admin/* aliases.
export { default } from '@/pages/admin/mantenimiento/mantenimiento-page'
