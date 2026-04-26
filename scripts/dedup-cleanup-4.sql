-- Deduplicate ALL ticketmaster events that share identical name + startsAt
-- Keeps the earliest createdAt, cancels all later duplicates
UPDATE "Event"
SET "isCancelled" = true
WHERE "externalSource" = 'ticketmaster'
  AND "isCancelled" = false
  AND id IN (
    SELECT e.id
    FROM "Event" e
    INNER JOIN (
      SELECT name, "startsAt", MIN("createdAt") AS first_created
      FROM "Event"
      WHERE "externalSource" = 'ticketmaster'
        AND "isCancelled" = false
        AND "startsAt" >= NOW() - INTERVAL '30 days'
      GROUP BY name, "startsAt"
      HAVING COUNT(*) > 1
    ) dupes ON e.name = dupes.name AND e."startsAt" = dupes."startsAt"
    WHERE e."createdAt" > dupes.first_created
      AND e."externalSource" = 'ticketmaster'
  );
