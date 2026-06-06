-- Migration 0011: Cohort Applications
-- Table to capture applications from founding cohort members (profiles A, B, C).

CREATE TABLE IF NOT EXISTS brand_twin.cohort_applications (
  application_id STRING NOT NULL,  -- PK (UUID)
  brand_name STRING NOT NULL,
  website STRING NOT NULL,
  profile_fit STRING NOT NULL,     -- 'paid_heavy' | 'early' | 'organic_led'
  monthly_ad_spend NUMERIC,
  platforms_connected JSON,        -- array of platforms e.g. ["shopify", "google", "meta"]
  untrusted_number_detail TEXT,    -- Q5: "the one number you wish you trusted but don't"
  email STRING NOT NULL,
  status STRING DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TIMESTAMP
) CLUSTER BY email;
