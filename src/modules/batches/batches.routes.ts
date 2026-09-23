import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { batchesService } from './batches.service.js';
import {
  createBatchSchema,
  updateBatchStageSchema,
  getBatchByIdSchema,
  listBatchesQuerySchema
} from './batches.schema.js';

export const batchesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /batches - seeds a new batch into a tray
  app.post('/', async (request, reply) => {
    const validatedBody = createBatchSchema.parse(request.body);
    const batch = await batchesService.seedBatch(validatedBody);
    return reply.status(201).send(batch);
  });

  // PATCH /batches/:id/stage - advances a batch by one stage
  app.patch('/:id/stage', async (request, reply) => {
    const { id } = getBatchByIdSchema.parse(request.params);
    const { stage } = updateBatchStageSchema.parse(request.body);
    const updatedBatch = await batchesService.advanceStage(id, stage as any);
    return reply.status(200).send(updatedBatch);
  });

  // GET /batches - lists batches with filtering (stage, crop, zone) and pagination
  app.get('/', async (request, reply) => {
    const query = listBatchesQuerySchema.parse(request.query);
    const results = await batchesService.listBatches(query);
    return reply.status(200).send(results);
  });

  // GET /batches/:id - retrieves one batch by ID
  app.get('/:id', async (request, reply) => {
    const { id } = getBatchByIdSchema.parse(request.params);
    const batch = await batchesService.getBatchById(id);
    return reply.status(200).send(batch);
  });
};
