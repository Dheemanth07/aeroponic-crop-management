-- =============================================================================
-- AgResearch Labs (ARL) - Aeroponic Facility Database Schema
-- =============================================================================
-- This schema models physical growing trays, batch lifecycles, harvest logs,
-- and API idempotency records for reliable aeroponic farm operations.
-- =============================================================================

-- Enable pgcrypto / uuid generation (standard in modern PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TRAYS TABLE
-- Physical growing surfaces located in facility zones.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Tray code must be globally unique per physical tray label (e.g. 'T-A-014')
    code VARCHAR(50) NOT NULL UNIQUE,
    -- Facility zone or room where tray resides (e.g. 'Zone-A', 'Greenhouse-1')
    zone VARCHAR(50) NOT NULL,
    -- Physical capacity specification (e.g., number of net pots)
    capacity_units INTEGER NOT NULL CHECK (capacity_units > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. BATCHES TABLE
-- A single planting of crops inside a physical tray progressing through stages.
-- Stages: SEEDED -> GERMINATION -> GROWING -> HARVEST_READY -> HARVESTED
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Foreign key to tray. Trays with active batches cannot be deleted (RESTRICT)
    tray_id UUID NOT NULL REFERENCES trays(id) ON DELETE RESTRICT,
    crop VARCHAR(100) NOT NULL,
    seeded_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stage VARCHAR(30) NOT NULL DEFAULT 'SEEDED' CHECK (
        stage IN ('SEEDED', 'GERMINATION', 'GROWING', 'HARVEST_READY', 'HARVESTED')
    ),
    expected_harvest_on TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Expected harvest cannot be earlier than seeding
    CONSTRAINT chk_expected_after_seeded CHECK (expected_harvest_on >= seeded_on)
);

-- =============================================================================
-- CRITICAL BUSINESS RULE ENFORCEMENT:
-- "A tray can hold at most one active batch. A batch is active until it reaches HARVESTED."
-- We enforce this at the database engine level using a PARTIAL UNIQUE INDEX.
-- Any INSERT or UPDATE attempting to set a batch to an active stage on an already
-- occupied tray will trigger a unique constraint violation (code 23505),
-- completely preventing race conditions even with multiple API instances.
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_batch_per_tray 
ON batches (tray_id) 
WHERE stage != 'HARVESTED';

-- Helpful query indexes for filtering
CREATE INDEX IF NOT EXISTS idx_batches_stage ON batches (stage);
CREATE INDEX IF NOT EXISTS idx_batches_crop ON batches (crop);
CREATE INDEX IF NOT EXISTS idx_batches_tray_id ON batches (tray_id);

-- -----------------------------------------------------------------------------
-- 3. HARVESTS TABLE
-- Records harvest yield, quality grade, and timestamp for a batch.
-- Each batch has at most one harvest record (UNIQUE constraint on batch_id).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS harvests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 1-to-1 relationship: A batch can only be harvested once
    batch_id UUID NOT NULL UNIQUE REFERENCES batches(id) ON DELETE RESTRICT,
    harvested_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Yield must be positive
    weight_grams INTEGER NOT NULL CHECK (weight_grams > 0),
    -- Produce quality grading
    grade VARCHAR(1) NOT NULL CHECK (grade IN ('A', 'B', 'C')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harvests_harvested_on ON harvests (harvested_on);

-- -----------------------------------------------------------------------------
-- 4. IDEMPOTENCY KEYS TABLE (Part 3b)
-- Stores response payloads for retried mobile requests from greenhouse staff.
-- Keys have a 24-hour time-to-live (TTL).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    batch_id UUID NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys (expires_at);
