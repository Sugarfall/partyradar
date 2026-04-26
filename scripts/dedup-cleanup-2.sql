-- Cancel the newer K-Pop Live Show 2 ticketmaster duplicate
-- Keep: cmo6iaemx006xljfqf79krqct (earlier createdAt), cancel: cmo6mfv0i00a3ljfqrb2j06lv
UPDATE "Event"
SET "isCancelled" = true
WHERE id = 'cmo6mfv0i00a3ljfqrb2j06lv'
  AND "isCancelled" = false;

-- Cancel perplexity Alex Warren duplicates where ticketmaster already has the canonical entry
-- Ticketmaster has cmo7tztg3002pnesg0s2nh4n4 (Alex Warren - Finding Family on the Road, OVO Hydro)
UPDATE "Event"
SET "isCancelled" = true
WHERE "externalSource" = 'perplexity'
  AND name ILIKE '%alex warren%'
  AND "isCancelled" = false;
