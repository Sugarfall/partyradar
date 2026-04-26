-- ─────────────────────────────────────────────────────────────────────────────
-- create-medal-tables.sql
-- Run this once in Railway → your Postgres service → Query tab (or via psql).
-- Creates the Medal and UserMedal tables that are missing from production.
-- Safe to run multiple times (uses IF NOT EXISTS / EXCEPTION guards).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enum types (idempotent)
DO $$ BEGIN
  CREATE TYPE "MedalTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MedalCategory" AS ENUM (
    'SOCIAL', 'EVENTS', 'HOST', 'EXPLORER', 'LOYALTY', 'SPECIAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MedalCondition" AS ENUM (
    'FOLLOWERS_COUNT', 'FOLLOWING_COUNT', 'EVENTS_ATTENDED', 'EVENTS_ORGANISED',
    'TICKETS_BOUGHT', 'CHECKINS_COUNT', 'REFERRALS_MADE', 'VENUES_VISITED',
    'POSTS_COUNT', 'SPECIFIC_EVENT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Medal table
CREATE TABLE IF NOT EXISTS "Medal" (
  "id"            TEXT              NOT NULL,
  "slug"          TEXT              NOT NULL,
  "name"          TEXT              NOT NULL,
  "description"   TEXT              NOT NULL,
  "icon"          TEXT              NOT NULL,
  "tier"          "MedalTier"       NOT NULL,
  "category"      "MedalCategory"   NOT NULL,
  "conditionType" "MedalCondition"  NOT NULL,
  "threshold"     INTEGER           NOT NULL DEFAULT 1,
  "eventId"       TEXT,
  "sortOrder"     INTEGER           NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN           NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Medal_pkey" PRIMARY KEY ("id")
);

-- 3. UserMedal table
CREATE TABLE IF NOT EXISTS "UserMedal" (
  "id"       TEXT         NOT NULL,
  "userId"   TEXT         NOT NULL,
  "medalId"  TEXT         NOT NULL,
  "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMedal_pkey" PRIMARY KEY ("id")
);

-- 4. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Medal_slug_tier_key"
  ON "Medal"("slug", "tier");

CREATE INDEX IF NOT EXISTS "Medal_category_isActive_idx"
  ON "Medal"("category", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "UserMedal_userId_medalId_key"
  ON "UserMedal"("userId", "medalId");

-- 5. Foreign keys (wrapped in DO blocks so they're idempotent)
DO $$ BEGIN
  ALTER TABLE "UserMedal"
    ADD CONSTRAINT "UserMedal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "UserMedal"
    ADD CONSTRAINT "UserMedal_medalId_fkey"
    FOREIGN KEY ("medalId") REFERENCES "Medal"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Done
SELECT 'Medal and UserMedal tables ready.' AS status;
