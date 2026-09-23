// =============================================================================
// AgResearch Labs (ARL) - Aeroponic Domain Types
// =============================================================================

export type BatchStage = 
  | 'SEEDED' 
  | 'GERMINATION' 
  | 'GROWING' 
  | 'HARVEST_READY' 
  | 'HARVESTED';

export type HarvestGrade = 'A' | 'B' | 'C';

// Physical tray located in a greenhouse zone
export interface Tray {
  id: string;
  code: string;
  zone: string;
  capacity_units: number;
  created_at: Date | string;
}

// Batch lifecycle tracked from seeding to harvest
export interface Batch {
  id: string;
  tray_id: string;
  crop: string;
  seeded_on: Date | string;
  stage: BatchStage;
  expected_harvest_on: Date | string;
  created_at: Date | string;
}

// Harvest record linked 1-to-1 to a batch
export interface Harvest {
  id: string;
  batch_id: string;
  harvested_on: Date | string;
  weight_grams: number;
  grade: HarvestGrade;
  created_at: Date | string;
}

// State machine definition: exactly one step forward, no skipping, no backwards
export const STAGE_FLOW: readonly BatchStage[] = [
  'SEEDED',
  'GERMINATION',
  'GROWING',
  'HARVEST_READY',
  'HARVESTED'
] as const;

export const NEXT_STAGE_MAP: Record<BatchStage, BatchStage | null> = {
  SEEDED: 'GERMINATION',
  GERMINATION: 'GROWING',
  GROWING: 'HARVEST_READY',
  HARVEST_READY: 'HARVESTED',
  HARVESTED: null // Terminal stage
};
