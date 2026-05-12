# Bulkhead — Production Migration Notes

Task #7 introduces two schema changes that must land in production
before the new code path is rolled out.

## 1. New table: `ops_audit_outbox`

Defined in `lib/db/src/schema/ops.ts`. The override transaction
enqueues a row here; the background drainer copies it into
`ops_actions`. Without this table the override route returns 500.

```sql
CREATE TABLE IF NOT EXISTS ops_audit_outbox (
  id            BIGSERIAL PRIMARY KEY,
  dedupe_key    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at    TIMESTAMPTZ,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_audit_outbox_dedupe_key_uq
  ON ops_audit_outbox (dedupe_key);
CREATE INDEX IF NOT EXISTS ops_audit_outbox_unclaimed_idx
  ON ops_audit_outbox (created_at) WHERE claimed_at IS NULL;
```

## 2. New column + index on `ops_actions`

`ops_actions.dedupe_key` is the consumer-side dedupe target. The
drainer relies on `ON CONFLICT (dedupe_key) DO NOTHING`, which
requires a **full** unique index (not partial — Postgres cannot
target a partial unique with `ON CONFLICT`).

```sql
ALTER TABLE ops_actions
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
-- backfill existing rows so the unique index can be created
UPDATE ops_actions SET dedupe_key = 'legacy:' || id::text
  WHERE dedupe_key IS NULL;
ALTER TABLE ops_actions
  ALTER COLUMN dedupe_key SET NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ops_actions_dedupe_key_uq
  ON ops_actions (dedupe_key);
```

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction; in
managed Postgres providers run it as a standalone statement and
verify with `\d ops_actions` before deploying app code.

## Rollout order

1. Apply migration above (drizzle push or hand-rolled SQL).
2. Verify both indexes exist (`\di ops_audit_outbox*` and
   `\di ops_actions*`).
3. Deploy api-server (the drainer is idempotent — it tolerates
   pre-existing rows with `ON CONFLICT`).
4. Watch `drain_failures_total` and override p95 latency in the
   first 10 min. If `drain_failures_total` increases steadily,
   inspect `ops_audit_outbox.last_error` for poison rows.

## Rollback

The new code path is feature-flagged only by route mount order
(override router mounts before `/api`). To roll back:

1. Revert the api-server deploy. Old code writes ops_actions
   synchronously and ignores the outbox entirely.
2. Leave the migration in place — the new tables/columns are
   backwards compatible (old code does not reference them).
3. Outbox rows enqueued by the new code that haven't drained yet
   will sit harmlessly until the next forward roll.
