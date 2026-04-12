import { PrismaClient, VenueType } from '@prisma/client'

const prisma = new PrismaClient()

const venues: {
  googlePlaceId: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  type: VenueType
  phone?: string
  website?: string
  rating?: number
  vibeTags: string[]
}[] = [
  {
    googlePlaceId: 'swg3_glasgow',
    name: 'SWG3',
    address: '100 Eastvale Pl, Glasgow G3 8QG',
    city: 'Glasgow',
    lat: 55.8625,
    lng: -4.2892,
    type: 'NIGHTCLUB',
    phone: '0141 576 5018',
    website: 'https://swg3.tv',
    rating: 4.7,
    vibeTags: ['techno', 'warehouse', 'underground', 'DJ'],
  },
  {
    googlePlaceId: 'subclub_glasgow',
    name: 'Sub Club',
    address: '22 Jamaica St, Glasgow G1 4QD',
    city: 'Glasgow',
    lat: 55.8569,
    lng: -4.2553,
    type: 'NIGHTCLUB',
    phone: '0141 248 4600',
    website: 'https://subclub.co.uk',
    rating: 4.8,
    vibeTags: ['techno', 'underground', 'iconic', 'DJ'],
  },
  {
    googlePlaceId: 'sanctuary_glasgow',
    name: 'Sanctuary',
    address: '18-22 Union St, Glasgow G1 3QF',
    city: 'Glasgow',
    lat: 55.8595,
    lng: -4.2524,
    type: 'NIGHTCLUB',
    rating: 4.3,
    vibeTags: ['house', 'club night', 'DJ'],
  },
  {
    googlePlaceId: 'oranmor_glasgow',
    name: 'Oran Mor',
    address: 'Top of Byres Rd, Glasgow G12 8QX',
    city: 'Glasgow',
    lat: 55.8737,
    lng: -4.2879,
    type: 'LOUNGE',
    rating: 4.5,
    vibeTags: ['live music', 'cocktails', 'rooftop'],
  },
  {
    googlePlaceId: 'hugpint_glasgow',
    name: 'The Hug and Pint',
    address: '171 Great Western Rd, Glasgow G4 9AW',
    city: 'Glasgow',
    lat: 55.8695,
    lng: -4.2726,
    type: 'PUB',
    rating: 4.4,
    vibeTags: ['live music', 'indie', 'chill'],
  },
  {
    googlePlaceId: 'sleazy_glasgow',
    name: 'Nice N Sleazy',
    address: '421 Sauchiehall St, Glasgow G2 3LG',
    city: 'Glasgow',
    lat: 55.8651,
    lng: -4.2699,
    type: 'BAR',
    rating: 4.3,
    vibeTags: ['indie', 'rock', 'live music', 'underground'],
  },
  {
    googlePlaceId: 'broadcast_glasgow',
    name: 'Broadcast',
    address: '427 Sauchiehall St, Glasgow G2 3LG',
    city: 'Glasgow',
    lat: 55.8652,
    lng: -4.2702,
    type: 'BAR',
    rating: 4.4,
    vibeTags: ['indie', 'alternative', 'live music'],
  },
  {
    googlePlaceId: 'polo_glasgow',
    name: 'The Polo Lounge',
    address: '84 Wilson St, Glasgow G1 1UZ',
    city: 'Glasgow',
    lat: 55.8573,
    lng: -4.2438,
    type: 'NIGHTCLUB',
    rating: 4.2,
    vibeTags: ['inclusive', 'club night', 'DJ'],
  },
  {
    googlePlaceId: 'buff_glasgow',
    name: 'Buff Club',
    address: '142 Bath Ln, Glasgow G2 4SQ',
    city: 'Glasgow',
    lat: 55.8627,
    lng: -4.2652,
    type: 'NIGHTCLUB',
    rating: 4.1,
    vibeTags: ['house', 'garage', 'DJ'],
  },
  {
    googlePlaceId: 'stereo_glasgow',
    name: 'Stereo',
    address: '20-28 Renfield Ln, Glasgow G2 6PH',
    city: 'Glasgow',
    lat: 55.8617,
    lng: -4.2575,
    type: 'BAR',
    rating: 4.6,
    vibeTags: ['alternative', 'vegan', 'live music', 'chill'],
  },
  {
    googlePlaceId: 'brel_glasgow',
    name: 'Brel',
    address: 'Ashton Ln, Glasgow G12 8SJ',
    city: 'Glasgow',
    lat: 55.8732,
    lng: -4.2849,
    type: 'BAR',
    rating: 4.5,
    vibeTags: ['cocktails', 'rooftop', 'chill'],
  },
  {
    googlePlaceId: 'chinaskis_glasgow',
    name: 'Chinaskis',
    address: '2 North Frederick St, Glasgow G1 2BS',
    city: 'Glasgow',
    lat: 55.862,
    lng: -4.249,
    type: 'BAR',
    rating: 4.3,
    vibeTags: ['rock', 'cocktails', 'indie'],
  },
  {
    googlePlaceId: 'garage_glasgow',
    name: 'The Garage',
    address: '490 Sauchiehall St, Glasgow G2 3LW',
    city: 'Glasgow',
    lat: 55.8651,
    lng: -4.2725,
    type: 'NIGHTCLUB',
    rating: 3.9,
    vibeTags: ['mainstream', 'club night', 'student'],
  },
  {
    googlePlaceId: 'room2_glasgow',
    name: 'Room 2',
    address: '22-26 Clyde Pl, Glasgow G5 8AQ',
    city: 'Glasgow',
    lat: 55.8537,
    lng: -4.2568,
    type: 'NIGHTCLUB',
    rating: 4.0,
    vibeTags: ['house', 'techno', 'rave'],
  },
  {
    googlePlaceId: 'admiral_glasgow',
    name: 'The Admiral Bar',
    address: '72A Waterloo St, Glasgow G2 7DA',
    city: 'Glasgow',
    lat: 55.8604,
    lng: -4.262,
    type: 'PUB',
    rating: 4.5,
    vibeTags: ['live music', 'indie', 'rock'],
  },
  {
    googlePlaceId: 'drygate_glasgow',
    name: 'Drygate Brewery',
    address: '85 Drygate, Glasgow G4 0UT',
    city: 'Glasgow',
    lat: 55.8628,
    lng: -4.233,
    type: 'BAR',
    rating: 4.5,
    vibeTags: ['craft beer', 'chill', 'rooftop'],
  },
  {
    googlePlaceId: 'flyingduck_glasgow',
    name: 'The Flying Duck',
    address: '142 Renfield St, Glasgow G2 3AU',
    city: 'Glasgow',
    lat: 55.8613,
    lng: -4.2571,
    type: 'BAR',
    rating: 4.4,
    vibeTags: ['alternative', 'indie', 'DJ', 'underground'],
  },
  {
    googlePlaceId: 'cathouse_glasgow',
    name: 'Cathouse Rock Club',
    address: '15 Union St, Glasgow G1 3RB',
    city: 'Glasgow',
    lat: 55.8594,
    lng: -4.2528,
    type: 'NIGHTCLUB',
    rating: 4.1,
    vibeTags: ['rock', 'metal', 'alternative', 'live music'],
  },
  {
    googlePlaceId: 'o2abc_glasgow',
    name: 'O2 ABC Glasgow',
    address: '300 Sauchiehall St, Glasgow G2 3JA',
    city: 'Glasgow',
    lat: 55.865,
    lng: -4.2676,
    type: 'CONCERT_HALL',
    rating: 4.3,
    vibeTags: ['live music', 'concerts', 'DJ'],
  },
  {
    googlePlaceId: 'kingtuts_glasgow',
    name: "King Tut's Wah Wah Hut",
    address: '272 St Vincent St, Glasgow G2 5RL',
    city: 'Glasgow',
    lat: 55.8624,
    lng: -4.2687,
    type: 'CONCERT_HALL',
    rating: 4.7,
    vibeTags: ['live music', 'indie', 'iconic', 'intimate'],
  },
  {
    googlePlaceId: 'slug-slouch',
    name: 'Slouch',
    address: '206 Woodlands Rd, Glasgow G3 6LN',
    city: 'Glasgow',
    lat: 55.8688,
    lng: -4.2753,
    type: 'BAR',
    phone: '0141 332 1711',
    rating: 4.2,
    vibeTags: ['cocktails', 'relaxed', 'indie', 'local-favourite'],
  },
]

async function main() {
  console.log('Seeding Glasgow venues (20 + Slouch)...')

  for (const venue of venues) {
    // Try matching by googlePlaceId first, or by name as fallback
    const existing = await prisma.venue.findFirst({
      where: {
        OR: [
          { googlePlaceId: venue.googlePlaceId },
          { name: venue.name, city: 'Glasgow' },
        ],
      },
    })

    if (existing) {
      const result = await prisma.venue.update({
        where: { id: existing.id },
        data: {
          googlePlaceId: venue.googlePlaceId,
          name: venue.name,
          address: venue.address,
          lat: venue.lat,
          lng: venue.lng,
          type: venue.type,
          phone: venue.phone,
          website: venue.website,
          rating: venue.rating,
          vibeTags: venue.vibeTags,
        },
      })
      console.log(`  ✓ Updated ${result.name} (${result.id})`)
    } else {
      const result = await prisma.venue.create({ data: venue })
      console.log(`  + Created ${result.name} (${result.id})`)
    }
  }

  console.log(`\nDone — seeded ${venues.length} venues.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
