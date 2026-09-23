# AgResearch Labs (ARL) - Aeroponic Facility Management API

A production-grade REST API built with Fastify, TypeScript, and PostgreSQL for managing aeroponic growing operations: physical tray inventory, crop batch lifecycles, and harvest yields.

---

## 1. Setup Instructions

The application is designed to run predictably on a clean machine with Node.js 20+ installed.

### Prerequisites
- Node.js (v20 or newer)
- npm (v10 or newer)
- (Optional) Docker or a running PostgreSQL instance

### Quick Start (Zero External Dependencies)

To run the test suite immediately without setting up or running PostgreSQL:

```bash
# 1. Clone the repository and enter the directory
git clone <your-repo-url>
cd agresearch-labs

# 2. Install dependencies
npm install

# 3. Run the automated test suite (22 tests covering Part 1, Part 2, and Part 3)
npm test
```

The test runner boots an in-memory PostgreSQL engine that parses and executes `schema.sql` directly, validating tables, indexes, constraints, and transactions without requiring local database credentials.

### Running with PostgreSQL and Docker

To run the live HTTP server with full database persistence:

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Start PostgreSQL in Docker
docker compose up -d

# 3. Run migrations
npm run db:migrate

# 4. Start the development server
npm run dev

# Or build and run production
npm run build
npm start
```

The server listens on `http://localhost:3000`. You can verify server status at `GET http://localhost:3000/health`.

---

## 2. Where Rules Are Enforced and Why

We implement a **Defense in Depth** architecture, enforcing rules across three distinct layers: the API Handler, the Service Layer, and the Database Engine.

### Layer 1: The Request Handler (API Boundary)
- **Role**: Syntactic validation, schema enforcement, and HTTP status code mapping.
- **Enforcement**:
  - We use Zod schemas to reject malformed JSON, negative harvest weights, invalid date formats, and unexpected fields before any domain logic executes.
  - Returns `400 Bad Request` with structured field-level error messages.
  - Maps missing resources to `404 Not Found`.

### Layer 2: The Service Layer (Domain Logic)
- **Role**: Business workflow sequencing, lifecycle state machine progression, and semantic validation.
- **Enforcement**:
  - **Sequential Transitions**: When advancing a batch (`PATCH /batches/:id/stage`), the service layer verifies that the requested stage matches the exact next stage in the lifecycle (`SEEDED -> GERMINATION -> GROWING -> HARVEST_READY`). It rejects skipped stages and backward transitions with `409 Conflict`.
  - **Harvest Precondition**: Enforces that a harvest can only be recorded when the current stage is strictly `HARVEST_READY`.
  - **Transaction Orchestration**: Wraps harvest creation and batch closure in an atomic database transaction.

### Layer 3: The Database Engine (Data Integrity & Concurrency Safety)
- **Role**: Absolute data consistency, relational integrity, and race-condition prevention across multiple API instances.
- **Enforcement**:
  - **Foreign Keys**: `ON DELETE RESTRICT` guarantees that trays with batches or batches with harvests cannot be orphaned.
  - **Check Constraints**: `stage IN (...)`, `grade IN ('A', 'B', 'C')`, and `expected_harvest_on >= seeded_on`.
  - **Partial Unique Index (Rule 1)**:
    ```sql
    CREATE UNIQUE INDEX idx_one_active_batch_per_tray 
    ON batches (tray_id) 
    WHERE stage != 'HARVESTED';
    ```
    This index guarantees that no tray can ever hold more than one active batch simultaneously. If two requests race to seed the same tray, the database serializes them and rejects the second with a unique constraint violation (`23505`), which our service catches and returns as `409 Conflict`.

### Rationale
Enforcing rules only in application code leaves the system vulnerable to race conditions when multiple API workers run behind a load balancer. Conversely, enforcing rules only in the database results in poor error readability and unnecessary database roundtrips. Validating syntax at the handler, sequencing at the service, and hard guarantees at the database provides optimal safety, performance, and developer experience.

---

## 3. Assumptions

The assignment specification left several intentional gaps. Below are the architectural and domain decisions made:

1. **Identifier Format (UUIDv4)**:
   The spec lists `id` fields without specifying a format. We use standard UUIDv4. In distributed and offline-first agricultural environments, UUIDs eliminate sequential enumeration vulnerabilities and allow client-side key generation.

2. **Date and Time Precision (TIMESTAMPTZ)**:
   Greenhouse planting and harvest logs depend on time-of-day temperature windows. We store dates as `TIMESTAMPTZ` in PostgreSQL and handle them as ISO 8601 strings in the API to prevent timezone offset discrepancies.

3. **Tray Code Uniqueness**:
   `code` (e.g. `T-A-014`) represents physical hardware labeling in a facility. We enforce a `UNIQUE` constraint on `trays.code`.

4. **Payload for PATCH /batches/:id/stage**:
   The spec does not define the request body for stage advancement. We accept `{"stage": "<TARGET_STAGE>"}` and explicitly validate that `<TARGET_STAGE>` is the immediate subsequent stage in the state machine. This prevents accidental double-clicks from advancing a batch further than intended. Direct transitions to `HARVESTED` are rejected on this route; batches must be harvested through `POST /batches/:id/harvest`.

5. **Tray Capacity vs. Batch Size**:
   Trays contain a `capacity_units` integer, but the suggested `Batch` schema does not include a plant quantity field. We treat `capacity_units` as physical hardware specification metadata (e.g., number of growing channels or net pots). Each active batch occupies one full tray.

6. **Single Harvest per Batch**:
   The spec states that recording a harvest moves the batch to `HARVESTED` and frees the tray. We enforce a 1-to-1 relationship (`UNIQUE` constraint on `harvests.batch_id`). Partial or split harvests are not permitted in this lifecycle model.

7. **Validation of Harvest Values**:
   `weight_grams` must be a positive integer (`> 0`). `grade` is strictly validated against enum values `'A'`, `'B'`, or `'C'`.

8. **Pagination Defaults**:
   For `GET /batches`, pagination defaults to `page=1` and `limit=20` (maximum 100), returning standard pagination metadata (`total`, `page`, `limit`, `totalPages`, `data`).

9. **Idempotency Window (Part 3b)**:
   Idempotency keys expire after 24 hours. This covers poor mobile connectivity retries and end-of-shift batch uploads while preventing unbounded table growth.

---

## 4. Part 3 Implementations & Rationale

We have implemented all three Part 3 extensions: 3a (Concurrency Safety), 3b (Idempotency), and 3c (Yield Reporting).

### 3a. Concurrency Safety

#### Problem
Two requests arrive at the exact same millisecond trying to seed a batch into tray `T-A-014`. Naive application-level checks (`if (!tray.hasActiveBatch)`) both read "empty" before either write completes, resulting in two active batches in one physical tray.

#### Solution
We solve this at the database storage engine layer using a partial unique index:
```sql
CREATE UNIQUE INDEX idx_one_active_batch_per_tray 
ON batches (tray_id) 
WHERE stage != 'HARVESTED';
```

When two concurrent requests attempt to insert active batches for the same `tray_id`, PostgreSQL's internal index locking mechanism guarantees that exactly one transaction succeeds while the other encounters error `23505` (unique_violation). The application error handler catches this code and responds with `409 Conflict`.

#### Multi-Instance / Load Balancer Behavior
If multiple API instances run behind a load balancer (e.g., NGINX or AWS ALB), in-memory mutexes or Node.js locks would fail because memory is not shared between processes. Our approach holds across any number of API replicas because the source of truth and lock contention is managed centrally by PostgreSQL.

---

### 3b. Idempotent Harvest Recording

#### Problem
In rural or indoor aeroponic facilities, mobile connections are frequently unstable. A worker submits a harvest; the server processes it and commits the transaction, but the network drops before the HTTP 201 response reaches the worker's device. The mobile app automatically retries the request. Without idempotency, the second attempt would fail with `409 Conflict` (batch already harvested), confusing the worker.

#### Solution
`POST /batches/:id/harvest` supports an optional `Idempotency-Key` header (e.g. client-generated UUID).
1. When a request arrives with an `Idempotency-Key`, the service checks the `idempotency_keys` table.
2. If found and not expired, the handler immediately returns the cached status code and payload without re-executing business logic.
3. If not found, the harvest transaction executes atomically, and the result is stored in `idempotency_keys` with an expiration timestamp (`NOW() + INTERVAL '24 hours'`).

#### Retention Decision
Keys are retained for **24 hours**. Cellular drops in farm facilities resolve within seconds or minutes. A 24-hour window accommodates edge cases where field workers queue actions offline throughout the day and sync when docking back at the facility network in the evening.

---

### 3c. Yield Reporting (Single SQL Query)

#### Endpoint
`GET /reports/yield?from=<TIMESTAMP>&to=<TIMESTAMP>&group_by=crop|zone`

#### The Query
```sql
SELECT 
  b.crop AS group_key, -- dynamically switched to t.zone when group_by=zone
  COALESCE(SUM(h.weight_grams), 0)::bigint AS total_harvested_weight,
  COUNT(h.id)::int AS batches_harvested,
  ROUND(
    COALESCE(
      AVG(h.harvested_on::date - b.seeded_on::date),
      0
    ), 
    2
  ) AS avg_days_to_harvest
FROM harvests h
JOIN batches b ON h.batch_id = b.id
JOIN trays t ON b.tray_id = t.id
WHERE h.harvested_on >= $1 AND h.harvested_on <= $2
GROUP BY b.crop
ORDER BY total_harvested_weight DESC;
```

#### How It Works
1. **Joins**: Joins `harvests` to `batches` (to access crop and seed date) and `trays` (to access zone).
2. **Date Filtering**: The `WHERE` clause filters harvests within the given range using indexed column `h.harvested_on`.
3. **Aggregations in One Pass**:
   - `SUM(h.weight_grams)` calculates total harvest yield.
   - `COUNT(h.id)` counts the number of harvested batches.
   - `(h.harvested_on::date - b.seeded_on::date)` computes the exact cycle duration in calendar days per batch.
   - `AVG(...)` and `ROUND(..., 2)` compute the average growth duration rounded to two decimal places.
4. **Grouping**: Groups by either `b.crop` or `t.zone` in a single query pass without nested loops or N+1 queries.

---

## 5. API Reference & Status Codes

| Method | Endpoint | Description | Success | Common Errors |
|---|---|---|---|---|
| `POST` | `/trays` | Register a new tray | `201 Created` | `400 Bad Request`, `409 Conflict` (duplicate code) |
| `GET` | `/trays` | List all trays | `200 OK` | - |
| `GET` | `/trays/:id` | Get tray by ID | `200 OK` | `400 Bad Request`, `404 Not Found` |
| `POST` | `/batches` | Seed a batch into a tray | `201 Created` | `400 Bad Request`, `404 Not Found`, `409 Conflict` (tray occupied) |
| `PATCH` | `/batches/:id/stage` | Advance batch stage | `200 OK` | `400 Bad Request`, `404 Not Found`, `409 Conflict` (invalid transition) |
| `POST` | `/batches/:id/harvest` | Record harvest & close batch | `201 Created` | `400 Bad Request`, `404 Not Found`, `409 Conflict` (not ready / harvested) |
| `GET` | `/batches` | List batches with filters & pagination | `200 OK` | `400 Bad Request` |
| `GET` | `/reports/yield` | Yield analytics by crop or zone | `200 OK` | `400 Bad Request` |

---

## 6. What Would Be Done With More Time

1. **Batch Termination / Loss Tracking**:
   In commercial aeroponics, disease (e.g. Pythium root rot) or pump failure can destroy a crop before harvest. Currently, the only way to free a tray is through `POST /batches/:id/harvest`. I would add a `TERMINATE` or `DISCARDED` transition allowing batches to be closed out with a logged reason (e.g. equipment failure, pathogen outbreak).

2. **Automated Idempotency Key Cleanup**:
   Implement a lightweight background job (or pg_cron task) that periodically deletes expired idempotency records (`DELETE FROM idempotency_keys WHERE expires_at < NOW()`).

3. **Facility Sensor Telemetry Integration**:
   Trays and zones could be linked to real-time EC (electrical conductivity), pH, and water temperature time-series telemetry to correlate environmental conditions with harvest grade distributions.

---

## 7. AI Usage Disclosure

Google Gemini was used for:
- Verifying PostgreSQL partial unique index syntax for the active batch constraint.
- Reviewing the date difference calculation for the single SQL yield report query.
- Brainstorming edge cases in the specification.

The following were designed and written directly:
- All Fastify API route handlers and HTTP status code mappings.
- Input validation schemas using Zod.
- Business logic for the sequential lifecycle state machine and harvest checks.
- Database table definitions and migration setup.
- The automated test suites for business rules, concurrency, and idempotency.
