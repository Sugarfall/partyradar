-- PartyRadar venue seed — Glasgow — 2026-04-04T15:59:56.784Z
-- Run against your PostgreSQL database

INSERT INTO "Venue" (
  id, "googlePlaceId", name, address, city, lat, lng, type,
  phone, website, "photoUrl", rating, "openingHours", "vibeTags",
  "isClaimed", "claimedById", "createdAt", "updatedAt"
) VALUES
  ('venue_p9n08uu6', 'swg3_glasgow', 'SWG3', '100 Eastvale Pl, Glasgow G3 8QG', 'Glasgow', 55.8625, -4.2892, 'NIGHTCLUB', '0141 576 5018', 'https://swg3.tv', NULL, 4.7, NULL, ARRAY['techno', 'warehouse', 'underground', 'DJ'], false, NULL, '2026-04-04T15:59:56.782Z', '2026-04-04T15:59:56.782Z'),
  ('venue_gqhk3uey', 'subclub_glasgow', 'Sub Club', '22 Jamaica St, Glasgow G1 4QD', 'Glasgow', 55.8569, -4.2553, 'NIGHTCLUB', '0141 248 4600', 'https://subclub.co.uk', NULL, 4.8, NULL, ARRAY['techno', 'underground', 'iconic', 'DJ'], false, NULL, '2026-04-04T15:59:56.783Z', '2026-04-04T15:59:56.783Z'),
  ('venue_vl1uadk5', 'sanctuary_glasgow', 'Sanctuary', '18-22 Union St, Glasgow G1 3QF', 'Glasgow', 55.8595, -4.2524, 'NIGHTCLUB', NULL, NULL, NULL, 4.3, NULL, ARRAY['house', 'club night', 'DJ'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_xetvb04o', 'oranmor_glasgow', 'Oran Mor', 'Top of Byres Rd, Glasgow G12 8QX', 'Glasgow', 55.8737, -4.2879, 'LOUNGE', NULL, NULL, NULL, 4.5, NULL, ARRAY['live music', 'cocktails', 'rooftop'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_a9172wya', 'hugpint_glasgow', 'The Hug and Pint', '171 Great Western Rd, Glasgow G4 9AW', 'Glasgow', 55.8695, -4.2726, 'PUB', NULL, NULL, NULL, 4.4, NULL, ARRAY['live music', 'indie', 'chill'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_oczb4405', 'sleazy_glasgow', 'Nice N Sleazy', '421 Sauchiehall St, Glasgow G2 3LG', 'Glasgow', 55.8651, -4.2699, 'BAR', NULL, NULL, NULL, 4.3, NULL, ARRAY['indie', 'rock', 'live music', 'underground'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_a6olbrke', 'broadcast_glasgow', 'Broadcast', '427 Sauchiehall St, Glasgow G2 3LG', 'Glasgow', 55.8652, -4.2702, 'BAR', NULL, NULL, NULL, 4.4, NULL, ARRAY['indie', 'alternative', 'live music'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_rlkz69cy', 'polo_glasgow', 'The Polo Lounge', '84 Wilson St, Glasgow G1 1UZ', 'Glasgow', 55.8573, -4.2438, 'NIGHTCLUB', NULL, NULL, NULL, 4.2, NULL, ARRAY['inclusive', 'club night', 'DJ'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_tj7c6sqc', 'buff_glasgow', 'Buff Club', '142 Bath Ln, Glasgow G2 4SQ', 'Glasgow', 55.8627, -4.2652, 'NIGHTCLUB', NULL, NULL, NULL, 4.1, NULL, ARRAY['house', 'garage', 'DJ'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_ede6z75z', 'stereo_glasgow', 'Stereo', '20-28 Renfield Ln, Glasgow G2 6PH', 'Glasgow', 55.8617, -4.2575, 'BAR', NULL, NULL, NULL, 4.6, NULL, ARRAY['alternative', 'vegan', 'live music', 'chill'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_txpnecl4', 'brel_glasgow', 'Brel', 'Ashton Ln, Glasgow G12 8SJ', 'Glasgow', 55.8732, -4.2849, 'BAR', NULL, NULL, NULL, 4.5, NULL, ARRAY['cocktails', 'rooftop', 'chill'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_vxqjgtue', 'chinaskis_glasgow', 'Chinaskis', '2 North Frederick St, Glasgow G1 2BS', 'Glasgow', 55.862, -4.249, 'BAR', NULL, NULL, NULL, 4.3, NULL, ARRAY['rock', 'cocktails', 'indie'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_gm5p72mq', 'garage_glasgow', 'The Garage', '490 Sauchiehall St, Glasgow G2 3LW', 'Glasgow', 55.8651, -4.2725, 'NIGHTCLUB', NULL, NULL, NULL, 3.9, NULL, ARRAY['mainstream', 'club night', 'student'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_0kb0lfkp', 'room2_glasgow', 'Room 2', '22-26 Clyde Pl, Glasgow G5 8AQ', 'Glasgow', 55.8537, -4.2568, 'NIGHTCLUB', NULL, NULL, NULL, 4, NULL, ARRAY['house', 'techno', 'rave'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_e3exx4oy', 'admiral_glasgow', 'The Admiral Bar', '72A Waterloo St, Glasgow G2 7DA', 'Glasgow', 55.8604, -4.262, 'PUB', NULL, NULL, NULL, 4.5, NULL, ARRAY['live music', 'indie', 'rock'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_mrkxr99t', 'drygate_glasgow', 'Drygate Brewery', '85 Drygate, Glasgow G4 0UT', 'Glasgow', 55.8628, -4.233, 'BAR', NULL, NULL, NULL, 4.5, NULL, ARRAY['craft beer', 'chill', 'rooftop'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_8pomij3p', 'flyingduck_glasgow', 'The Flying Duck', '142 Renfield St, Glasgow G2 3AU', 'Glasgow', 55.8613, -4.2571, 'BAR', NULL, NULL, NULL, 4.4, NULL, ARRAY['alternative', 'indie', 'DJ', 'underground'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_ezlpy26u', 'cathouse_glasgow', 'Cathouse Rock Club', '15 Union St, Glasgow G1 3RB', 'Glasgow', 55.8594, -4.2528, 'NIGHTCLUB', NULL, NULL, NULL, 4.1, NULL, ARRAY['rock', 'metal', 'alternative', 'live music'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_9i2vn73y', 'o2abc_glasgow', 'O2 ABC Glasgow', '300 Sauchiehall St, Glasgow G2 3JA', 'Glasgow', 55.865, -4.2676, 'CONCERT_HALL', NULL, NULL, NULL, 4.3, NULL, ARRAY['live music', 'concerts', 'DJ'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z'),
  ('venue_21dca17l', 'kingtuts_glasgow', 'King Tut''s Wah Wah Hut', '272 St Vincent St, Glasgow G2 5RL', 'Glasgow', 55.8624, -4.2687, 'CONCERT_HALL', NULL, NULL, NULL, 4.7, NULL, ARRAY['live music', 'indie', 'iconic', 'intimate'], false, NULL, '2026-04-04T15:59:56.784Z', '2026-04-04T15:59:56.784Z')
ON CONFLICT ("googlePlaceId") DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  rating = EXCLUDED.rating,
  "updatedAt" = NOW();
