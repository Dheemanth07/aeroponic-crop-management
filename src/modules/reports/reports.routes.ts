import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { reportsRepository } from './reports.repo.js';
import { yieldReportQuerySchema } from './reports.schema.js';

export const reportsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /reports/yield - returns aggregated yield statistics by crop or zone
  app.get('/yield', async (request, reply) => {
    const { from, to, group_by } = yieldReportQuerySchema.parse(request.query);
    const report = await reportsRepository.getYieldReport(from, to, group_by);
    return reply.status(200).send(report);
  });
};
