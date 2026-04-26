-- Hard-target the two K-Pop Show 2 duplicates by ID, no isCancelled guard
-- Keep: cmo6iaemx006xljfqf79krqct (earlier cuid), cancel: cmo6mfv0i00a3ljfqrb2j06lv
UPDATE "Event"
SET "isCancelled" = true
WHERE id = 'cmo6mfv0i00a3ljfqrb2j06lv';

-- Also run general ROW_NUMBER dedup across ALL sources with no isCancelled guard
-- so we catch any rows where isCancelled is NULL
UPDATE "Event"
SET "isCancelled" = true
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY name, "startsAt", "externalSource"
        ORDER BY "createdAt" ASC, id ASC
      ) AS rn
    FROM "Event"
    WHERE "startsAt" >= NOW() - INTERVAL '30 days'
      AND COALESCE("isCancelled", false) = false
  ) ranked
  WHERE rn > 1
);
