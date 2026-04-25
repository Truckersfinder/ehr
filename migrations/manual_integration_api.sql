-- External integration API: API keys, webhooks, idempotency, external ID mapping.
-- Run against your Postgres database if tables are not created via drizzle-kit push.

CREATE TABLE IF NOT EXISTS integration_api_keys (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  secret_hash text NOT NULL,
  scopes jsonb NOT NULL,
  facility_id varchar,
  created_by_user_id varchar NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_webhook_subscriptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_api_key_id varchar NOT NULL REFERENCES integration_api_keys(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  event_types jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_webhook_deliveries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id varchar NOT NULL REFERENCES integration_webhook_subscriptions(id) ON DELETE CASCADE,
  event_type varchar(120) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error text,
  last_status_code integer,
  created_at timestamptz DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS integration_webhook_deliveries_due ON integration_webhook_deliveries (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS integration_external_mappings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type varchar(64) NOT NULL,
  internal_id varchar NOT NULL,
  external_system varchar(128) NOT NULL,
  external_id varchar(512) NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT integration_extmap_system_type_extid UNIQUE (external_system, resource_type, external_id)
);

CREATE INDEX IF NOT EXISTS integration_extmap_internal ON integration_external_mappings (resource_type, internal_id);

CREATE TABLE IF NOT EXISTS integration_idempotency_keys (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_api_key_id varchar NOT NULL,
  idempotency_key varchar(256) NOT NULL,
  request_fingerprint varchar(128) NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT integration_idem_key_per_apikey UNIQUE (integration_api_key_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS integration_idem_created ON integration_idempotency_keys (created_at);
