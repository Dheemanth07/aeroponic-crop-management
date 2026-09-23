import { z } from 'zod';

export const yieldReportQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be ISO-8601 or YYYY-MM-DD')),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be ISO-8601 or YYYY-MM-DD')),
  group_by: z.enum(['crop', 'zone'], {
    errorMap: () => ({ message: "group_by must be either 'crop' or 'zone'" })
  })
}).refine(data => {
  const fromDate = new Date(data.from).getTime();
  const toDate = new Date(data.to).getTime();
  return toDate >= fromDate;
}, {
  message: "'to' timestamp must be greater than or equal to 'from' timestamp",
  path: ['to']
});

export type YieldReportQuery = z.infer<typeof yieldReportQuerySchema>;
