-- Cancel the duplicate K-Pop Show 2 — keep 1AUZkugGkdfiBjJ (lex earlier), cancel 1AUZkuzGkdUADPq
UPDATE "Event"
SET "isCancelled" = true
WHERE "ticketmasterId" = '1AUZkuzGkdUADPq';
