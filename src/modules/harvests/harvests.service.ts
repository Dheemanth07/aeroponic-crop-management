import { harvestsRepository, HarvestsRepository } from './harvests.repo.js';
import { batchesRepository, BatchesRepository } from '../batches/batches.repo.js';
import { RecordHarvestInput } from './harvests.schema.js';
import { NotFoundError, ConflictError } from '../../plugins/error-handler.js';

export class HarvestsService {
  constructor(
    private harvestRepo: HarvestsRepository = harvestsRepository,
    private batchRepo: BatchesRepository = batchesRepository
  ) {}

  /**
   * BUSINESS RULE 4:
   * "A harvest can only be recorded for a batch in HARVEST_READY.
   * Recording a harvest moves the batch to HARVESTED and frees the tray for reuse."
   * 
   * PART 3b: Idempotent Harvest Recording
   * If an Idempotency-Key header is supplied, retried requests will safely return
   * the original successful response without executing a duplicate harvest.
   */
  async recordHarvest(
    batchId: string,
    input: RecordHarvestInput,
    idempotencyKey?: string
  ): Promise<{ status: number; data: any }> {
    // 1. Check for existing idempotent response (Part 3b)
    if (idempotencyKey) {
      const cached = await this.harvestRepo.getIdempotencyRecord(idempotencyKey);
      if (cached) {
        return {
          status: cached.response_status,
          data: typeof cached.response_body === 'string' 
            ? JSON.parse(cached.response_body) 
            : cached.response_body
        };
      }
    }

    // 2. Validate batch existence
    const batch = await this.batchRepo.findById(batchId);
    if (!batch) {
      throw new NotFoundError(`Batch with ID '${batchId}' not found`);
    }

    // 3. Validate batch readiness for harvest
    if (batch.stage === 'HARVESTED') {
      throw new ConflictError(
        `Batch '${batchId}' has already been harvested and closed.`
      );
    }

    if (batch.stage !== 'HARVEST_READY') {
      throw new ConflictError(
        `A harvest can only be recorded for a batch in HARVEST_READY stage. Current stage is '${batch.stage}'.`
      );
    }

    // 4. Execute atomic transaction (insert harvest + mark batch HARVESTED)
    const result = await this.harvestRepo.recordHarvestAtomic(
      batchId,
      input.weight_grams,
      input.grade,
      input.harvested_on
    );

    const responsePayload = {
      message: 'Harvest recorded successfully. Tray is now freed for reuse.',
      harvest: result.harvest,
      batch: result.batch
    };

    // 5. Cache response if idempotency key was provided
    if (idempotencyKey) {
      await this.harvestRepo.saveIdempotencyRecord(
        idempotencyKey,
        batchId,
        201,
        responsePayload
      );
    }

    return {
      status: 201,
      data: responsePayload
    };
  }
}

export const harvestsService = new HarvestsService();
