-- PartyRadar venue seed — London — 2026-04-04T15:59:56.885Z
-- Run against your PostgreSQL database

INSERT INTO "Venue" (
  id, "googlePlaceId", name, address, city, lat, lng, type,
  phone, website, "photoUrl", rating, "openingHours", "vibeTags",
  "isClaimed", "claimedById", "createdAt", "updatedAt"
) VALUES
  ('venue_aj2w3kf8', 'fabric_london', 'Fabric', '77a Charterhouse St, London EC1M 6HJ', 'London', 51.5206, -0.1006, 'NIGHTCLUB', NULL, 'https://fabriclondon.com', NULL, 4.7, NULL, ARRAY['techno', 'drum and bass', 'underground', 'iconic'], false, NULL, '2026-04-04T15:59:56.883Z', '2026-04-04T15:59:56.883Z'),
  ('venue_hawnwcmw', 'printworks_london', 'Printworks London', 'Surrey Quays Rd, London SE16 7PJ', 'London', 51.4983, -0.049, 'CONCERT_HALL', NULL, 'https://printworkslondon.co.uk', NULL, 4.8, NULL, ARRAY['techno', 'warehouse', 'rave', 'immersive'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_92d3cdm2', 'fold_london', 'Fold', 'Unit 2b Blondin St, London E3 2DD', 'London', 51.5265, -0.0155, 'NIGHTCLUB', NULL, NULL, NULL, 4.6, NULL, ARRAY['techno', 'inclusive', 'underground', 'rave'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_4r58sezp', 'vu_london', 'Village Underground', '54 Holywell Ln, London EC2A 3PQ', 'London', 51.5237, -0.0793, 'CONCERT_HALL', NULL, NULL, NULL, 4.6, NULL, ARRAY['live music', 'alternative', 'warehouse'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_sq3x4eg3', 'xoyo_london', 'XOYO', '32-37 Cowper St, London EC2A 4AP', 'London', 51.5268, -0.0862, 'NIGHTCLUB', NULL, NULL, NULL, 4.5, NULL, ARRAY['house', 'techno', 'club night', 'DJ'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_qha7i76z', 'egg_london', 'EGG London', '200 York Way, London N7 9AX', 'London', 51.5459, -0.1194, 'NIGHTCLUB', NULL, NULL, NULL, 4.3, NULL, ARRAY['house', 'techno', 'outdoor', 'rave'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_48yi9pvz', 'omeara_london', 'Omeara', '5 Tooley St, London SE1 2PF', 'London', 51.5046, -0.0847, 'CONCERT_HALL', NULL, NULL, NULL, 4.6, NULL, ARRAY['live music', 'indie', 'intimate'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_1dugzuw8', 'corsica_london', 'Corsica Studios', '5 Elephant Rd, London SE17 1LB', 'London', 51.4935, -0.102, 'NIGHTCLUB', NULL, NULL, NULL, 4.5, NULL, ARRAY['techno', 'underground', 'warehouse', 'rave'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_hkflq9fz', 'jazzcafe_london', 'Jazz Cafe', '5 Parkway, London NW1 7PG', 'London', 51.5388, -0.1436, 'LOUNGE', NULL, NULL, NULL, 4.5, NULL, ARRAY['jazz', 'soul', 'live music', 'intimate'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_fapstgsj', 'mos_london', 'Ministry of Sound', '103 Gaunt St, London SE1 6DP', 'London', 51.4964, -0.1007, 'NIGHTCLUB', NULL, 'https://ministryofsound.com', NULL, 4.4, NULL, ARRAY['house', 'iconic', 'club night', 'DJ'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_cd7jfj37', 'phonox_london', 'Phonox', '418 Brixton Rd, London SW9 7AY', 'London', 51.4634, -0.1144, 'NIGHTCLUB', NULL, NULL, NULL, 4.5, NULL, ARRAY['house', 'soul', 'underground', 'DJ'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_aia71amp', 'ovalspace_london', 'Oval Space', '29-32 The Oval, London E2 9DT', 'London', 51.528, -0.0573, 'CONCERT_HALL', NULL, NULL, NULL, 4.6, NULL, ARRAY['techno', 'warehouse', 'live music', 'rave'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_8xxw7uxj', 'lightbox_london', 'Lightbox', '6 South Lambeth Pl, London SW8 1SP', 'London', 51.4807, -0.1232, 'NIGHTCLUB', NULL, NULL, NULL, 4.1, NULL, ARRAY['house', 'club night', 'DJ'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_ko7f7gg5', 'bussey_london', 'Bussey Building', '133 Rye Ln, London SE15 4ST', 'London', 51.4695, -0.0631, 'CONCERT_HALL', NULL, NULL, NULL, 4.7, NULL, ARRAY['rooftop', 'outdoor', 'events', 'alternative'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_59j9ctxb', 'hackneychurch_london', 'Hackney Church Brew Co', 'Arch 364, Warburton Rd, London E8 3FH', 'London', 51.5434, -0.056, 'BAR', NULL, NULL, NULL, 4.6, NULL, ARRAY['craft beer', 'chill', 'outdoor'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_5gl69rw0', 'nhac_london', 'Notting Hill Arts Club', '21 Notting Hill Gate, London W11 3JQ', 'London', 51.5089, -0.1974, 'NIGHTCLUB', NULL, NULL, NULL, 4.3, NULL, ARRAY['alternative', 'indie', 'DJ', 'intimate'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_18i8nyna', 'ronniescotts_london', 'Ronnie Scott''s', '47 Frith St, London W1D 4HT', 'London', 51.5133, -0.1317, 'LOUNGE', NULL, 'https://ronniescotts.co.uk', NULL, 4.8, NULL, ARRAY['jazz', 'live music', 'iconic', 'intimate'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_5foift47', '100club_london', '100 Club', '100 Oxford St, London W1D 1LL', 'London', 51.5155, -0.1379, 'CONCERT_HALL', NULL, NULL, NULL, 4.6, NULL, ARRAY['jazz', 'blues', 'live music', 'iconic'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_iik0gjgw', 'electricbrixton_london', 'Electric Brixton', 'Town Hall Parade, London SW2 1RJ', 'London', 51.4627, -0.1154, 'CONCERT_HALL', NULL, NULL, NULL, 4.4, NULL, ARRAY['live music', 'club night', 'DJ'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z'),
  ('venue_p5q0xtqw', 'tobaccodock_london', 'Tobacco Dock', 'Tobacco Quay, Wapping Ln, London E1W 2SF', 'London', 51.5071, -0.0596, 'CONCERT_HALL', NULL, NULL, NULL, 4.5, NULL, ARRAY['warehouse', 'rave', 'immersive', 'massive'], false, NULL, '2026-04-04T15:59:56.885Z', '2026-04-04T15:59:56.885Z')
ON CONFLICT ("googlePlaceId") DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  rating = EXCLUDED.rating,
  "updatedAt" = NOW();
