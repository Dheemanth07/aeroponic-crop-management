import { z } from 'zod';

export const recordHarvestSchema = z.object({
  harvested_on: z.string().datetime({ offset: true }).or(z.string().datetime()).or(z.date()).optional(),
  weight_grams: z.number().int().positive('Harvest weight must be a positive integer in grams'),
  grade: z.enum(['A', 'B', 'C'], {
    errorMap: () => ({ message: "Harvest grade must be 'A', 'B', or 'C'" })
  })
});

export const harvestBatchParamsSchema = z.object({
  id: z.string().uuid('Invalid batch UUID format')
});

export const idempotencyHeaderSchema = z.object({
  'idempotency-key': z.string().trim().min(1).optional()
}).passthrough();

export type RecordHarvestInput = z.infer<typeof recordHarvestSchema>;
export type HarvestBatchParams = z.infer<typeof harvestBatchParamsSchema>;
