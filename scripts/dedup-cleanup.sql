-- ──────────────────────────────────────────────────────────────────────────────
-- One-off deduplication cleanup.
-- Strategy: where Ticketmaster/Skiddle has the canonical event, cancel the
-- weaker Perplexity duplicates. For pure Perplexity duplicates (same festival
-- split into many rows), keep the single most-complete entry.
-- All removals use isCancelled = true (reversible).
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Cancel all Perplexity K-Pop Live entries — Ticketmaster has Show 1 & 2
UPDATE "Event"
SET "isCancelled" = true
WHERE "externalSource" = 'perplexity'
  AND name ILIKE '%k-pop%'
  AND "isCancelled" = false;

-- 2. Cancel Perplexity "Glasgow Blues, Rhythm & Rock Festival" — Ticketmaster
--    has the real one (cmo6iael5006vljfq2fb1fvzf)
UPDATE "Event"
SET "isCancelled" = true
WHERE "externalSource" = 'perplexity'
  AND name ILIKE '%blues%rhythm%rock%'
  AND "isCancelled" = false;

-- 3. Glasgow Cocktail Festival — keep only the earliest Perplexity entry,
--    cancel all subsequent duplicates (same festival, split across 6 rows).
--    Keep: cmo8hzwt101259dkdfoet64mr (CONCERT, Apr 24, earliest createdAt)
UPDATE "Event"
SET "isCancelled" = true
WHERE "externalSource" = 'perplexity'
  AND name ILIKE '%cocktail festival%'
  AND id != 'cmo8hzwt101259dkdfoet64mr'
  AND "isCancelled" = false;

-- 4. Cancel duplicate Perplexity "Terminal V Festival" entries — keep only the
--    one from Ticketmaster/SerpAPI if present, or the earliest Perplexity row.
--    Ticketmaster hasn't indexed it, so keep the one with the best venue data.
--    Keep: cmo8f415f00dh9dkd1jzrs0l6 (SWG3 Osborne St, noon Apr 26)
UPDATE "Event"
SET "isCancelled" = true
WHERE "externalSource" = 'perplexity'
  AND name ILIKE '%terminal v%'
  AND id != 'cmo8f415f00dh9dkd1jzrs0l6'
  AND "isCancelled" = false;

-- 5. Deduplicate "Buff Bingo Drag Brunch" — keep the more detailed Perplexity
--    entry (cmo7uz6hw0078gugn5bqpg936, £35, Buff Club, noon start, 4h duration)
--    cancel the vaguer duplicate (cmo7yrpw000asays9g4f7c5kz, £25, no end time)
UPDATE "Event"
SET "isCancelled" = true
WHERE id = 'cmo7yrpw000asays9g4f7c5kz'
  AND "isCancelled" = false;

-- 6. Cancel duplicate "Sub Club Classic" / "Late-Night DJs" where the same
--    venue appears twice on the same date from Perplexity batch sync.
--    Group: same name + same startsAt = duplicates, keep lowest createdAt.
UPDATE "Event"
SET "isCancelled" = true
WHERE "externalSource" = 'perplexity'
  AND "isCancelled" = false
  AND id IN (
    -- Find all non-winning rows: same name+startsAt, but not the earliest
    SELECT e.id
    FROM "Event" e
    INNER JOIN (
      SELECT name, "startsAt", MIN("createdAt") AS first_created
      FROM "Event"
      WHERE "externalSource" = 'perplexity'
        AND "isCancelled" = false
        AND "startsAt" >= NOW() - INTERVAL '30 days'
      GROUP BY name, "startsAt"
      HAVING COUNT(*) > 1
    ) dupes ON e.name = dupes.name AND e."startsAt" = dupes."startsAt"
    WHERE e."createdAt" > dupes.first_created
      AND e."externalSource" = 'perplexity'
  );

-- Show what's left after cleanup
SELECT
  COUNT(*) FILTER (WHERE "isCancelled" = false) AS active_events,
  COUNT(*) FILTER (WHERE "isCancelled" = true)  AS cancelled_events,
  COUNT(*) FILTER (WHERE "isCancelled" = false AND "externalSource" = 'perplexity') AS active_perplexity,
  COUNT(*) FILTER (WHERE "isCancelled" = false AND "externalSource" = 'ticketmaster') AS active_ticketmaster
FROM "Event"
WHERE "startsAt" >= NOW() - INTERVAL '7 days';
