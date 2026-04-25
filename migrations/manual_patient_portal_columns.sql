-- Run against your Postgres DB if `npm run db:push` is not used (e.g. production).
ALTER TABLE patients ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS portal_access_email text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS portal_invite_token text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS portal_pin_hash text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS portal_invite_sent_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS patients_portal_invite_token_uidx ON patients (portal_invite_token);

ALTER TABLE facilities ADD COLUMN IF NOT EXISTS patient_portal_config jsonb;
