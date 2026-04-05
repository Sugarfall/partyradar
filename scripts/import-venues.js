/**
 * PartyRadar — Venue Import Script
 *
 * Usage:
 *   # With Google Places API (real data):
 *   GOOGLE_PLACES_API_KEY=xxx CITY=Glasgow node scripts/import-venues.js
 *
 *   # Demo data (no API key needed):
 *   CITY=Glasgow node scripts/import-venues.js
 *   CITY=London node scripts/import-venues.js
 *
 * Outputs:
 *   scripts/venues-{city}.json   — raw venue data
 *   scripts/seed-{city}.sql      — ready-to-run SQL INSERT statements
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const CITY = process.env.CITY || 'Glasgow'
const API_KEY = process.env.GOOGLE_PLACES_API_KEY

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_VENUES = {
  Glasgow: [
    { name: 'SWG3', address: '100 Eastvale Pl, Glasgow G3 8QG', lat: 55.8625, lng: -4.2892, type: 'NIGHTCLUB', rating: 4.7, vibeTags: ['techno', 'warehouse', 'underground', 'DJ'], phone: '0141 576 5018', website: 'https://swg3.tv', googlePlaceId: 'swg3_glasgow' },
    { name: 'Sub Club', address: '22 Jamaica St, Glasgow G1 4QD', lat: 55.8569, lng: -4.2553, type: 'NIGHTCLUB', rating: 4.8, vibeTags: ['techno', 'underground', 'iconic', 'DJ'], phone: '0141 248 4600', website: 'https://subclub.co.uk', googlePlaceId: 'subclub_glasgow' },
    { name: 'Sanctuary', address: '18-22 Union St, Glasgow G1 3QF', lat: 55.8595, lng: -4.2524, type: 'NIGHTCLUB', rating: 4.3, vibeTags: ['house', 'club night', 'DJ'], googlePlaceId: 'sanctuary_glasgow' },
    { name: 'Oran Mor', address: 'Top of Byres Rd, Glasgow G12 8QX', lat: 55.8737, lng: -4.2879, type: 'LOUNGE', rating: 4.5, vibeTags: ['live music', 'cocktails', 'rooftop'], googlePlaceId: 'oranmor_glasgow' },
    { name: 'The Hug and Pint', address: '171 Great Western Rd, Glasgow G4 9AW', lat: 55.8695, lng: -4.2726, type: 'PUB', rating: 4.4, vibeTags: ['live music', 'indie', 'chill'], googlePlaceId: 'hugpint_glasgow' },
    { name: 'Nice N Sleazy', address: '421 Sauchiehall St, Glasgow G2 3LG', lat: 55.8651, lng: -4.2699, type: 'BAR', rating: 4.3, vibeTags: ['indie', 'rock', 'live music', 'underground'], googlePlaceId: 'sleazy_glasgow' },
    { name: 'Broadcast', address: '427 Sauchiehall St, Glasgow G2 3LG', lat: 55.8652, lng: -4.2702, type: 'BAR', rating: 4.4, vibeTags: ['indie', 'alternative', 'live music'], googlePlaceId: 'broadcast_glasgow' },
    { name: 'The Polo Lounge', address: '84 Wilson St, Glasgow G1 1UZ', lat: 55.8573, lng: -4.2438, type: 'NIGHTCLUB', rating: 4.2, vibeTags: ['inclusive', 'club night', 'DJ'], googlePlaceId: 'polo_glasgow' },
    { name: 'Buff Club', address: '142 Bath Ln, Glasgow G2 4SQ', lat: 55.8627, lng: -4.2652, type: 'NIGHTCLUB', rating: 4.1, vibeTags: ['house', 'garage', 'DJ'], googlePlaceId: 'buff_glasgow' },
    { name: 'Stereo', address: '20-28 Renfield Ln, Glasgow G2 6PH', lat: 55.8617, lng: -4.2575, type: 'BAR', rating: 4.6, vibeTags: ['alternative', 'vegan', 'live music', 'chill'], googlePlaceId: 'stereo_glasgow' },
    { name: 'Brel', address: 'Ashton Ln, Glasgow G12 8SJ', lat: 55.8732, lng: -4.2849, type: 'BAR', rating: 4.5, vibeTags: ['cocktails', 'rooftop', 'chill'], googlePlaceId: 'brel_glasgow' },
    { name: 'Chinaskis', address: '2 North Frederick St, Glasgow G1 2BS', lat: 55.8620, lng: -4.2490, type: 'BAR', rating: 4.3, vibeTags: ['rock', 'cocktails', 'indie'], googlePlaceId: 'chinaskis_glasgow' },
    { name: 'The Garage', address: '490 Sauchiehall St, Glasgow G2 3LW', lat: 55.8651, lng: -4.2725, type: 'NIGHTCLUB', rating: 3.9, vibeTags: ['mainstream', 'club night', 'student'], googlePlaceId: 'garage_glasgow' },
    { name: 'Room 2', address: '22-26 Clyde Pl, Glasgow G5 8AQ', lat: 55.8537, lng: -4.2568, type: 'NIGHTCLUB', rating: 4.0, vibeTags: ['house', 'techno', 'rave'], googlePlaceId: 'room2_glasgow' },
    { name: 'The Admiral Bar', address: '72A Waterloo St, Glasgow G2 7DA', lat: 55.8604, lng: -4.2620, type: 'PUB', rating: 4.5, vibeTags: ['live music', 'indie', 'rock'], googlePlaceId: 'admiral_glasgow' },
    { name: 'Drygate Brewery', address: '85 Drygate, Glasgow G4 0UT', lat: 55.8628, lng: -4.2330, type: 'BAR', rating: 4.5, vibeTags: ['craft beer', 'chill', 'rooftop'], googlePlaceId: 'drygate_glasgow' },
    { name: 'The Flying Duck', address: '142 Renfield St, Glasgow G2 3AU', lat: 55.8613, lng: -4.2571, type: 'BAR', rating: 4.4, vibeTags: ['alternative', 'indie', 'DJ', 'underground'], googlePlaceId: 'flyingduck_glasgow' },
    { name: 'Cathouse Rock Club', address: '15 Union St, Glasgow G1 3RB', lat: 55.8594, lng: -4.2528, type: 'NIGHTCLUB', rating: 4.1, vibeTags: ['rock', 'metal', 'alternative', 'live music'], googlePlaceId: 'cathouse_glasgow' },
    { name: 'O2 ABC Glasgow', address: '300 Sauchiehall St, Glasgow G2 3JA', lat: 55.8650, lng: -4.2676, type: 'CONCERT_HALL', rating: 4.3, vibeTags: ['live music', 'concerts', 'DJ'], googlePlaceId: 'o2abc_glasgow' },
    { name: 'King Tut\'s Wah Wah Hut', address: '272 St Vincent St, Glasgow G2 5RL', lat: 55.8624, lng: -4.2687, type: 'CONCERT_HALL', rating: 4.7, vibeTags: ['live music', 'indie', 'iconic', 'intimate'], googlePlaceId: 'kingtuts_glasgow' },
  ],
  London: [
    { name: 'Fabric', address: '77a Charterhouse St, London EC1M 6HJ', lat: 51.5206, lng: -0.1006, type: 'NIGHTCLUB', rating: 4.7, vibeTags: ['techno', 'drum and bass', 'underground', 'iconic'], website: 'https://fabriclondon.com', googlePlaceId: 'fabric_london' },
    { name: 'Printworks London', address: 'Surrey Quays Rd, London SE16 7PJ', lat: 51.4983, lng: -0.0490, type: 'CONCERT_HALL', rating: 4.8, vibeTags: ['techno', 'warehouse', 'rave', 'immersive'], website: 'https://printworkslondon.co.uk', googlePlaceId: 'printworks_london' },
    { name: 'Fold', address: 'Unit 2b Blondin St, London E3 2DD', lat: 51.5265, lng: -0.0155, type: 'NIGHTCLUB', rating: 4.6, vibeTags: ['techno', 'inclusive', 'underground', 'rave'], googlePlaceId: 'fold_london' },
    { name: 'Village Underground', address: '54 Holywell Ln, London EC2A 3PQ', lat: 51.5237, lng: -0.0793, type: 'CONCERT_HALL', rating: 4.6, vibeTags: ['live music', 'alternative', 'warehouse'], googlePlaceId: 'vu_london' },
    { name: 'XOYO', address: '32-37 Cowper St, London EC2A 4AP', lat: 51.5268, lng: -0.0862, type: 'NIGHTCLUB', rating: 4.5, vibeTags: ['house', 'techno', 'club night', 'DJ'], googlePlaceId: 'xoyo_london' },
    { name: 'EGG London', address: '200 York Way, London N7 9AX', lat: 51.5459, lng: -0.1194, type: 'NIGHTCLUB', rating: 4.3, vibeTags: ['house', 'techno', 'outdoor', 'rave'], googlePlaceId: 'egg_london' },
    { name: 'Omeara', address: '5 Tooley St, London SE1 2PF', lat: 51.5046, lng: -0.0847, type: 'CONCERT_HALL', rating: 4.6, vibeTags: ['live music', 'indie', 'intimate'], googlePlaceId: 'omeara_london' },
    { name: 'Corsica Studios', address: '5 Elephant Rd, London SE17 1LB', lat: 51.4935, lng: -0.1020, type: 'NIGHTCLUB', rating: 4.5, vibeTags: ['techno', 'underground', 'warehouse', 'rave'], googlePlaceId: 'corsica_london' },
    { name: 'Jazz Cafe', address: '5 Parkway, London NW1 7PG', lat: 51.5388, lng: -0.1436, type: 'LOUNGE', rating: 4.5, vibeTags: ['jazz', 'soul', 'live music', 'intimate'], googlePlaceId: 'jazzcafe_london' },
    { name: 'Ministry of Sound', address: '103 Gaunt St, London SE1 6DP', lat: 51.4964, lng: -0.1007, type: 'NIGHTCLUB', rating: 4.4, vibeTags: ['house', 'iconic', 'club night', 'DJ'], website: 'https://ministryofsound.com', googlePlaceId: 'mos_london' },
    { name: 'Phonox', address: '418 Brixton Rd, London SW9 7AY', lat: 51.4634, lng: -0.1144, type: 'NIGHTCLUB', rating: 4.5, vibeTags: ['house', 'soul', 'underground', 'DJ'], googlePlaceId: 'phonox_london' },
    { name: 'Oval Space', address: '29-32 The Oval, London E2 9DT', lat: 51.5280, lng: -0.0573, type: 'CONCERT_HALL', rating: 4.6, vibeTags: ['techno', 'warehouse', 'live music', 'rave'], googlePlaceId: 'ovalspace_london' },
    { name: 'Lightbox', address: '6 South Lambeth Pl, London SW8 1SP', lat: 51.4807, lng: -0.1232, type: 'NIGHTCLUB', rating: 4.1, vibeTags: ['house', 'club night', 'DJ'], googlePlaceId: 'lightbox_london' },
    { name: 'Bussey Building', address: '133 Rye Ln, London SE15 4ST', lat: 51.4695, lng: -0.0631, type: 'CONCERT_HALL', rating: 4.7, vibeTags: ['rooftop', 'outdoor', 'events', 'alternative'], googlePlaceId: 'bussey_london' },
    { name: 'Hackney Church Brew Co', address: 'Arch 364, Warburton Rd, London E8 3FH', lat: 51.5434, lng: -0.0560, type: 'BAR', rating: 4.6, vibeTags: ['craft beer', 'chill', 'outdoor'], googlePlaceId: 'hackneychurch_london' },
    { name: 'Notting Hill Arts Club', address: '21 Notting Hill Gate, London W11 3JQ', lat: 51.5089, lng: -0.1974, type: 'NIGHTCLUB', rating: 4.3, vibeTags: ['alternative', 'indie', 'DJ', 'intimate'], googlePlaceId: 'nhac_london' },
    { name: 'Ronnie Scott\'s', address: '47 Frith St, London W1D 4HT', lat: 51.5133, lng: -0.1317, type: 'LOUNGE', rating: 4.8, vibeTags: ['jazz', 'live music', 'iconic', 'intimate'], website: 'https://ronniescotts.co.uk', googlePlaceId: 'ronniescotts_london' },
    { name: '100 Club', address: '100 Oxford St, London W1D 1LL', lat: 51.5155, lng: -0.1379, type: 'CONCERT_HALL', rating: 4.6, vibeTags: ['jazz', 'blues', 'live music', 'iconic'], googlePlaceId: '100club_london' },
    { name: 'Electric Brixton', address: 'Town Hall Parade, London SW2 1RJ', lat: 51.4627, lng: -0.1154, type: 'CONCERT_HALL', rating: 4.4, vibeTags: ['live music', 'club night', 'DJ'], googlePlaceId: 'electricbrixton_london' },
    { name: 'Tobacco Dock', address: 'Tobacco Quay, Wapping Ln, London E1W 2SF', lat: 51.5071, lng: -0.0596, type: 'CONCERT_HALL', rating: 4.5, vibeTags: ['warehouse', 'rave', 'immersive', 'massive'], googlePlaceId: 'tobaccodock_london' },
  ],
}

// ─── Google Places API Fetch ──────────────────────────────────────────────────

function fetchPlaces(query, pageToken = null) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      query: `${query} in ${CITY}`,
      key: API_KEY,
      language: 'en',
    })
    if (pageToken) params.set('pagetoken', pageToken)

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
    https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
}

function mapGooglePlace(place, type) {
  return {
    googlePlaceId: place.place_id,
    name: place.name,
    address: place.formatted_address,
    lat: place.geometry.location.lat,
    lng: place.geometry.location.lng,
    type,
    rating: place.rating || null,
    vibeTags: [],
    city: CITY,
  }
}

async function fetchFromGoogle() {
  const results = []
  const queries = [
    { q: 'nightclub', type: 'NIGHTCLUB' },
    { q: 'bar', type: 'BAR' },
    { q: 'live music venue', type: 'CONCERT_HALL' },
    { q: 'rooftop bar', type: 'ROOFTOP_BAR' },
  ]

  for (const { q, type } of queries) {
    console.log(`  Fetching ${q}s in ${CITY}...`)
    let data = await fetchPlaces(q)
    results.push(...(data.results || []).map((p) => mapGooglePlace(p, type)))

    // Handle pagination (up to 2 extra pages)
    for (let i = 0; i < 2 && data.next_page_token; i++) {
      await new Promise((r) => setTimeout(r, 2000)) // Required delay for next_page_token
      data = await fetchPlaces(q, data.next_page_token)
      results.push(...(data.results || []).map((p) => mapGooglePlace(p, type)))
    }
  }

  // Deduplicate by googlePlaceId
  const seen = new Set()
  return results.filter((v) => {
    if (seen.has(v.googlePlaceId)) return false
    seen.add(v.googlePlaceId)
    return true
  })
}

// ─── SQL Generator ────────────────────────────────────────────────────────────

function toSQL(venues) {
  const rows = venues.map((v) => {
    const id = `venue_${Math.random().toString(36).slice(2, 10)}`
    const vibeTags = `ARRAY[${v.vibeTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ')}]`
    const now = new Date().toISOString()
    return `  ('${id}', ${v.googlePlaceId ? `'${v.googlePlaceId}'` : 'NULL'}, '${v.name.replace(/'/g, "''")}', '${v.address.replace(/'/g, "''")}', '${v.city}', ${v.lat}, ${v.lng}, '${v.type}', ${v.phone ? `'${v.phone}'` : 'NULL'}, ${v.website ? `'${v.website}'` : 'NULL'}, NULL, ${v.rating || 'NULL'}, NULL, ${vibeTags}, false, NULL, '${now}', '${now}')`
  })
  return `-- PartyRadar venue seed — ${CITY} — ${new Date().toISOString()}
-- Run against your PostgreSQL database

INSERT INTO "Venue" (
  id, "googlePlaceId", name, address, city, lat, lng, type,
  phone, website, "photoUrl", rating, "openingHours", "vibeTags",
  "isClaimed", "claimedById", "createdAt", "updatedAt"
) VALUES
${rows.join(',\n')}
ON CONFLICT ("googlePlaceId") DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  rating = EXCLUDED.rating,
  "updatedAt" = NOW();
`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n⚡ PartyRadar Venue Import — ${CITY}`)
  console.log('─'.repeat(40))

  let venues

  if (API_KEY) {
    console.log('🌐 Using Google Places API...')
    venues = await fetchFromGoogle()
    venues = venues.map((v) => ({ ...v, city: CITY }))
  } else {
    console.log('📦 No API key — using demo data...')
    venues = (DEMO_VENUES[CITY] || []).map((v) => ({ ...v, city: CITY }))
    if (!venues.length) {
      console.error(`❌ No demo data for "${CITY}". Supported: ${Object.keys(DEMO_VENUES).join(', ')}`)
      process.exit(1)
    }
  }

  console.log(`✅ Found ${venues.length} venues`)

  const outDir = path.join(__dirname)
  const jsonFile = path.join(outDir, `venues-${CITY.toLowerCase()}.json`)
  const sqlFile = path.join(outDir, `seed-${CITY.toLowerCase()}.sql`)

  fs.writeFileSync(jsonFile, JSON.stringify(venues, null, 2))
  fs.writeFileSync(sqlFile, toSQL(venues))

  console.log(`\n📄 JSON → ${jsonFile}`)
  console.log(`🗄️  SQL  → ${sqlFile}`)
  console.log('\nTo seed your database:')
  console.log(`  psql $DATABASE_URL -f ${sqlFile}`)
  console.log('\nTo claim a venue (once DB is live):')
  console.log('  POST /api/venues/:id/claim')
  console.log('\n✨ Done!\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
