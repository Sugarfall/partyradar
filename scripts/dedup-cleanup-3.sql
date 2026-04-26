-- Cancel duplicate K-Pop Live Show 2 from Ticketmaster
-- Same name + same startsAt = duplicate; keep the one with the earliest createdAt
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
        AND name ILIKE '%k-pop live%show 2%'
      GROUP BY name, "startsAt"
      HAVING COUNT(*) > 1
    ) dupes ON e.name = dupes.name AND e."startsAt" = dupes."startsAt"
    WHERE e."createdAt" > dupes.first_created
      AND e."externalSource" = 'ticketmaster'
  );
