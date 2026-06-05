-- Migration 0002: Create error_events table for durable observability
CREATE TABLE IF NOT EXISTS brand_twin.error_events(
  event_id    TEXT PRIMARY KEY,
  tenant_id   TEXT,                  -- nullable: pre-auth errors
  severity    TEXT NOT NULL,         -- 'error' | 'warning' | 'critical'
  source      TEXT NOT NULL,         -- module/operation
  message     TEXT NOT NULL,
  context     JSONB,                 -- REDACTED — never tokens/PAN/secrets
  trace_id    TEXT,                  -- correlate to MetricsTracker span
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
