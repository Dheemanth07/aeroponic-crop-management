import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { harvestsService } from './harvests.service.js';
import { recordHarvestSchema, harvestBatchParamsSchema } from './harvests.schema.js';

export const harvestsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /batches/:id/harvest - records harvest and closes out batch
  app.post('/:id/harvest', async (request, reply) => {
    const { id } = harvestBatchParamsSchema.parse(request.params);
    const body = recordHarvestSchema.parse(request.body);

    // Extract Idempotency-Key header (RFC standard allows case-insensitive retrieval)
    const idempotencyKey = (
      request.headers['idempotency-key'] || 
      request.headers['Idempotency-Key']
    ) as string | undefined;

    const result = await harvestsService.recordHarvest(
      id,
      body,
      idempotencyKey?.trim() || undefined
    );

    return reply.status(result.status).send(result.data);
  });
};
