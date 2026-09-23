import Fastify, { FastifyInstance } from 'fastify';
import { errorHandler } from './plugins/error-handler.js';
import { traysRoutes } from './modules/trays/trays.routes.js';
import { batchesRoutes } from './modules/batches/batches.routes.js';
import { harvestsRoutes } from './modules/harvests/harvests.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false
  });

  // Register centralized error handler
  app.setErrorHandler(errorHandler);

  // Health check endpoint
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Register API domain route modules
  app.register(traysRoutes, { prefix: '/trays' });
  app.register(batchesRoutes, { prefix: '/batches' });
  app.register(harvestsRoutes, { prefix: '/batches' });
  app.register(reportsRoutes, { prefix: '/reports' });

  return app;
}
