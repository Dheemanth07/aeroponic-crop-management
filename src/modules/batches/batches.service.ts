import { batchesRepository, BatchesRepository } from './batches.repo.js';
import { traysRepository, TraysRepository } from '../trays/trays.repo.js';
import { CreateBatchInput, ListBatchesQuery } from './batches.schema.js';
import { NotFoundError, ConflictError } from '../../plugins/error-handler.js';
import { Batch, BatchStage, NEXT_STAGE_MAP } from '../../types/index.js';

export class BatchesService {
  constructor(
    private batchRepo: BatchesRepository = batchesRepository,
    private trayRepo: TraysRepository = traysRepository
  ) {}

  /**
   * BUSINESS RULE 1:
   * "A tray can hold at most one active batch. A batch is active until it reaches HARVESTED."
   */
  async seedBatch(input: CreateBatchInput): Promise<Batch> {
    // 1. Verify tray exists
    const tray = await this.trayRepo.findById(input.tray_id);
    if (!tray) {
      throw new NotFoundError(`Tray with ID '${input.tray_id}' not found`);
    }

    // 2. Check if tray is currently occupied by an active batch
    const activeBatch = await this.batchRepo.findActiveByTrayId(input.tray_id);
    if (activeBatch) {
      throw new ConflictError(
        `Tray '${tray.code}' (${tray.id}) already holds active batch '${activeBatch.id}' in stage '${activeBatch.stage}'. A tray can hold at most one active batch.`
      );
    }

    // 3. Create batch (DB partial unique index also provides guaranteed concurrency safety)
    return this.batchRepo.create(
      input.tray_id,
      input.crop,
      input.expected_harvest_on,
      input.seeded_on
    );
  }

  async getBatchById(id: string): Promise<Batch> {
    const batch = await this.batchRepo.findById(id);
    if (!batch) {
      throw new NotFoundError(`Batch with ID '${id}' not found`);
    }
    return batch;
  }

  /**
   * BUSINESS RULES 2 & 3:
   * "Stage transitions only move forward, and only one step at a time. 
   * You cannot skip GROWING, and you cannot go back."
   */
  async advanceStage(batchId: string, requestedTargetStage: BatchStage): Promise<Batch> {
    const batch = await this.getBatchById(batchId);

    // Terminal stage check
    if (batch.stage === 'HARVESTED') {
      throw new ConflictError(
        `Batch '${batchId}' is already HARVESTED and closed. No further transitions allowed.`
      );
    }

    // Direct transition to HARVESTED must go through the harvest recording endpoint
    if (requestedTargetStage === 'HARVESTED') {
      throw new ConflictError(
        `Batches can only transition to HARVESTED by recording a harvest via POST /batches/${batchId}/harvest.`
      );
    }

    const expectedNextStage = NEXT_STAGE_MAP[batch.stage];

    // Reject skipping or going backwards
    if (requestedTargetStage !== expectedNextStage) {
      throw new ConflictError(
        `Invalid stage transition from '${batch.stage}' to '${requestedTargetStage}'. Transitions must move strictly one step forward. The only valid next stage is '${expectedNextStage}'.`
      );
    }

    return this.batchRepo.updateStage(batchId, requestedTargetStage);
  }

  async listBatches(query: ListBatchesQuery) {
    return this.batchRepo.findAllWithPagination(query);
  }
}

export const batchesService = new BatchesService();
