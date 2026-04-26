-- Fix events that were imported with a midnight-UTC placeholder start time.
-- The AI sync (Perplexity) stores "2026-04-26T00:00:00.000Z" when the real
-- time isn't in the source data. parsePerplexityStart() was added to prevent
-- new imports having this problem, but existing rows need a retroactive fix.
--
-- We apply the same type-aware local hour as the code (Europe/London, BST=UTC+1):
--   CLUB_NIGHT  22:00 London → 21:00 UTC
--   HOME_PARTY  21:00 London → 20:00 UTC
--   PUB_NIGHT   20:00 London → 19:00 UTC
--   CONCERT     19:00 London → 18:00 UTC
--   BEACH_PARTY 16:00 London → 15:00 UTC
--   YACHT_PARTY 18:00 London → 17:00 UTC
--
-- Only touches future / recent events (last 30 days → next 60 days).
-- Safe to run multiple times (idempotent: already-fixed rows won't match).

-- 1. Preview how many rows will be updated
SELECT
  type,
  COUNT(*) AS affected,
  MIN("startsAt") AS earliest,
  MAX("startsAt") AS latest
FROM "Event"
WHERE
  EXTRACT(HOUR   FROM "startsAt") = 0
  AND EXTRACT(MINUTE FROM "startsAt") = 0
  AND EXTRACT(SECOND FROM "startsAt") = 0
  AND "startsAt" >= NOW() - INTERVAL '30 days'
  AND "startsAt" <= NOW() + INTERVAL '60 days'
  AND "isCancelled" = false
GROUP BY type
ORDER BY type;

-- 2. Apply fix
UPDATE "Event"
SET "startsAt" =
  DATE_TRUNC('day', "startsAt") +
  CASE type
    WHEN 'CLUB_NIGHT'   THEN INTERVAL '21 hours'
    WHEN 'HOME_PARTY'   THEN INTERVAL '20 hours'
    WHEN 'PUB_NIGHT'    THEN INTERVAL '19 hours'
    WHEN 'CONCERT'      THEN INTERVAL '18 hours'
    WHEN 'BEACH_PARTY'  THEN INTERVAL '15 hours'
    WHEN 'YACHT_PARTY'  THEN INTERVAL '17 hours'
    ELSE                     INTERVAL '19 hours'
  END
WHERE
  EXTRACT(HOUR   FROM "startsAt") = 0
  AND EXTRACT(MINUTE FROM "startsAt") = 0
  AND EXTRACT(SECOND FROM "startsAt") = 0
  AND "startsAt" >= NOW() - INTERVAL '30 days'
  AND "startsAt" <= NOW() + INTERVAL '60 days'
  AND "isCancelled" = false;
