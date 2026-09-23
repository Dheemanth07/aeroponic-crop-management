import { z } from 'zod';

export const createTraySchema = z.object({
  code: z.string().trim().min(1, 'Tray code is required'),
  zone: z.string().trim().min(1, 'Zone is required'),
  capacity_units: z.number().int().positive('Capacity units must be a positive integer')
});

export const getTrayByIdSchema = z.object({
  id: z.string().uuid('Invalid tray UUID format')
});

export type CreateTrayInput = z.infer<typeof createTraySchema>;
export type GetTrayByIdParams = z.infer<typeof getTrayByIdSchema>;
