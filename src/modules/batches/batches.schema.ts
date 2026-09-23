import { z } from 'zod';
import { STAGE_FLOW } from '../../types/index.js';

export const createBatchSchema = z.object({
  tray_id: z.string().uuid('Invalid tray UUID format'),
  crop: z.string().trim().min(1, 'Crop name is required'),
  seeded_on: z.string().datetime({ offset: true }).optional().or(z.string().datetime()).or(z.date()).optional(),
  expected_harvest_on: z.string().datetime({ offset: true }).or(z.string().datetime()).or(z.date())
}).refine(data => {
  if (data.seeded_on && data.expected_harvest_on) {
    const seeded = new Date(data.seeded_on).getTime();
    const harvest = new Date(data.expected_harvest_on).getTime();
    return harvest >= seeded;
  }
  return true;
}, {
  message: 'expected_harvest_on must be after or equal to seeded_on',
  path: ['expected_harvest_on']
});

export const updateBatchStageSchema = z.object({
  stage: z.enum(STAGE_FLOW as [string, ...string[]], {
    errorMap: () => ({ message: `Invalid stage. Must be one of: ${STAGE_FLOW.join(', ')}` })
  })
});

export const getBatchByIdSchema = z.object({
  id: z.string().uuid('Invalid batch UUID format')
});

export const listBatchesQuerySchema = z.object({
  stage: z.enum(STAGE_FLOW as [string, ...string[]]).optional(),
  crop: z.string().trim().optional(),
  zone: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchStageInput = z.infer<typeof updateBatchStageSchema>;
export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;
