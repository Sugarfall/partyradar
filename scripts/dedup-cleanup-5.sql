-- Deduplicate ticketmaster events using ROW_NUMBER so identical createdAt timestamps
-- are handled correctly (id used as tiebreaker to guarantee exactly one winner).
UPDATE "Event"
SET "isCancelled" = true
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY name, "startsAt"
        ORDER BY "createdAt" ASC, id ASC
      ) AS rn
    FROM "Event"
    WHERE "externalSource" = 'ticketmaster'
      AND "isCancelled" = false
      AND "startsAt" >= NOW() - INTERVAL '30 days'
  ) ranked
  WHERE rn > 1
);
