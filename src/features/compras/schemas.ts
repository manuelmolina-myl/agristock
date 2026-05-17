/**
 * Zod schemas for the compras module.
 * Single source of truth for form validation; types derived via z.infer.
 */
import { z } from 'zod'

export const requisitionPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent'])

export const requisitionLineInputSchema = z.object({
  item_id: z.string().uuid().nullable(),
  free_description: z.string().min(2).max(200).nullable(),
  quantity: z.number().positive('Cantidad mayor a 0'),
  unit_id: z.string().uuid().nullable(),
  estimated_unit_cost: z.number().nonnegative().nullable(),
  currency: z.enum(['MXN', 'USD']).nullable(),
  notes: z.string().max(500).optional().nullable(),
}).refine(
  (v) => v.item_id !== null || (v.free_description?.trim().length ?? 0) >= 2,
  { message: 'Indica un ítem del catálogo o describe el material', path: ['item_id'] },
)

export const requisitionCreateSchema = z.object({
  priority: requisitionPriorityEnum,
  justification: z.string().min(5, 'Mínimo 5 caracteres').max(1000),
  crop_lot_id: z.string().uuid().nullable().optional(),
  equipment_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).optional().nullable(),
  lines: z.array(requisitionLineInputSchema).min(1, 'Agrega al menos un ítem'),
})

export type RequisitionCreateInput = z.infer<typeof requisitionCreateSchema>
export type RequisitionLineInput = z.infer<typeof requisitionLineInputSchema>

// ─── Reception ──────────────────────────────────────────────────────────────

export const receptionLineInputSchema = z.object({
  po_line_id: z.string().uuid(),
  received_qty: z.number().nonnegative(),
  accepted_qty: z.number().nonnegative(),
  rejection_reason: z.string().max(500).optional().nullable(),
  supplier_lot: z.string().max(100).optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
}).refine((v) => v.accepted_qty <= v.received_qty, {
  message: 'Aceptado no puede exceder recibido',
  path: ['accepted_qty'],
})

export const receptionCreateSchema = z.object({
  po_id: z.string().uuid(),
  warehouse_id: z.string().uuid('Selecciona un almacén'),
  supplier_note: z.string().max(200).optional().nullable(),
  quality_notes: z.string().max(500).optional().nullable(),
  photos: z.array(z.string().url()).default([]),
  lines: z.array(receptionLineInputSchema).min(1),
})

export type ReceptionCreateInput = z.infer<typeof receptionCreateSchema>
export type ReceptionLineInput = z.infer<typeof receptionLineInputSchema>
