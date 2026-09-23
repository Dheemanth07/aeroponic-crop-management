import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { traysService } from './trays.service.js';
import { createTraySchema, getTrayByIdSchema } from './trays.schema.js';

export const traysRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /trays - creates a new physical tray
  app.post('/', async (request, reply) => {
    // Validate request body with Zod
    const validatedBody = createTraySchema.parse(request.body);
    const tray = await traysService.createTray(validatedBody);
    return reply.status(201).send(tray);
  });

  // GET /trays - lists all trays
  app.get('/', async (_request, reply) => {
    const trays = await traysService.getAllTrays();
    return reply.status(200).send(trays);
  });

  // GET /trays/:id - returns one tray or 404
  app.get('/:id', async (request, reply) => {
    const { id } = getTrayByIdSchema.parse(request.params);
    const tray = await traysService.getTrayById(id);
    return reply.status(200).send(tray);
  });
};
