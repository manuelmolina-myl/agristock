import { z } from 'zod'

export const woPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])

export const createCorrectiveWOSchema = z.object({
  equipment_id: z.string().uuid('Selecciona un equipo'),
  failure_type_id: z.string().uuid('Selecciona un tipo de falla').nullable(),
  description: z.string().min(5, 'Describe la falla (mínimo 5 caracteres)').max(2000),
  priority: woPrioritySchema,
  scheduled_date: z.string().nullable(),
  photos: z.array(z.string().url()),
})
export type CreateCorrectiveWOInput = z.infer<typeof createCorrectiveWOSchema>

export const assignWOSchema = z.object({
  wo_id: z.string().uuid(),
  technician_id: z.string().uuid('Selecciona un técnico'),
  helpers: z.array(z.string().uuid()),
  scheduled_date: z.string().optional().nullable(),
  estimated_hours: z.number().positive().nullable().optional(),
})
export type AssignWOInput = z.infer<typeof assignWOSchema>

export const consumePartSchema = z.object({
  wo_id: z.string().uuid(),
  item_id: z.string().uuid('Selecciona una refacción'),
  warehouse_id: z.string().uuid('Selecciona un almacén'),
  quantity: z.number().positive('Cantidad mayor a 0'),
})
export type ConsumePartInput = z.infer<typeof consumePartSchema>

export const closeWOSchema = z.object({
  wo_id: z.string().uuid(),
  solution: z.string().min(5, 'Describe la solución aplicada').max(2000),
  photos_after: z.array(z.string().url()),
  hours_meter_close: z.number().positive().nullable().optional(),
  external_cost: z.number().nonnegative().nullable().optional(),
  force: z.boolean(),
})
export type CloseWOInput = z.infer<typeof closeWOSchema>
