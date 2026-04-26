-- Fix venue addresses on events where the external-source import stored the
-- wrong address/coordinates.  We copy the correct values from the curated
-- Venue record so that the event map, weather widget, and Uber link all point
-- to the real physical location.
--
-- Run once against the production DB.

-- ── SWG3 Glasgow ─────────────────────────────────────────────────────────────
-- Correct address: 100 Eastvale Pl, Glasgow G3 8QG  (lat 55.8625, lng -4.2892)
-- Wrong address seen in prod: 6-22 Shore Road, Glasgow G11 6BP

UPDATE "Event"
SET
  address = v.address,
  lat     = v.lat,
  lng     = v.lng,
  "updatedAt" = NOW()
FROM "Venue" v
WHERE
  "Event"."venueId" = v.id
  AND v."googlePlaceId" = 'swg3_glasgow'
  AND (
    "Event".address  <> v.address OR
    "Event".lat      <> v.lat     OR
    "Event".lng      <> v.lng
  )
  AND "Event"."isCancelled" = false;

-- ── Generic: sync any event whose linked venue has different coordinates ──────
-- This catches other venues that may have been imported with wrong geo-data.
-- Uncomment if you want to bulk-fix all linked events:
--
-- UPDATE "Event"
-- SET
--   address    = v.address,
--   lat        = v.lat,
--   lng        = v.lng,
--   "updatedAt" = NOW()
-- FROM "Venue" v
-- WHERE
--   "Event"."venueId" = v.id
--   AND (
--     "Event".address <> v.address OR
--     abs("Event".lat - v.lat) > 0.001 OR
--     abs("Event".lng - v.lng) > 0.001
--   )
--   AND "Event"."isCancelled" = false;
