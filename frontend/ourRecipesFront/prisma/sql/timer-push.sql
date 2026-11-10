-- Additive setup for projects that use prisma db push (this repo has no baseline migration history).
BEGIN;
-- Serialize overlapping production deploys before creating tables/indexes.
SELECT pg_advisory_xact_lock(hashtext('ourrecipes:timer-push-schema'));
CREATE TABLE IF NOT EXISTS timer_push_subscriptions (
  id TEXT PRIMARY KEY,
  owner_id VARCHAR(100) NOT NULL,
  endpoint_hash VARCHAR(64) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(100) NOT NULL,
  auth VARCHAR(32) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS timer_push_subscriptions_endpoint_hash_key ON timer_push_subscriptions(endpoint_hash);
CREATE INDEX IF NOT EXISTS timer_push_subscriptions_owner_id_idx ON timer_push_subscriptions(owner_id);
CREATE TABLE IF NOT EXISTS recipe_timer_push (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES timer_push_subscriptions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  timer_id VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL,
  state VARCHAR(20) NOT NULL,
  ends_at TIMESTAMP(3),
  recipe_name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NOT NULL,
  recipe_url VARCHAR(200) NOT NULL,
  muted BOOLEAN NOT NULL DEFAULT false,
  workflow_id TEXT,
  notified_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS recipe_timer_push_subscription_id_timer_id_key ON recipe_timer_push(subscription_id,timer_id);
CREATE INDEX IF NOT EXISTS recipe_timer_push_subscription_id_state_idx ON recipe_timer_push(subscription_id,state);
COMMIT;
