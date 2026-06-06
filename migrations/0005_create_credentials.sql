-- Migration to create the secure credentials table for integrations (B1.4)
CREATE TABLE IF NOT EXISTS brand_twin.credentials (
  tenant_id VARCHAR(255) NOT NULL,
  platform VARCHAR(100) NOT NULL,
  credential_key VARCHAR(255) NOT NULL,
  encrypted_value TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, platform, credential_key)
);
