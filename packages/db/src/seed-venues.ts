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
  vibeTags: string[]
}[] = [
  {
    googlePlaceId: 'slug-sub-club',
    name: 'Sub Club',
    address: '22 Jamaica St, Glasgow G1 4QD',
    city: 'Glasgow',
    lat: 55.8584,
    lng: -4.2574,
    type: 'NIGHTCLUB',
    website: 'https://www.subclub.co.uk',
    vibeTags: ['techno', 'underground', 'late-night', 'legendary'],
  },
  {
    googlePlaceId: 'slug-swg3',
    name: 'SWG3',
    address: 'Eastvale Place, Glasgow G3 8QG',
    city: 'Glasgow',
    lat: 55.8679,
    lng: -4.2866,
    type: 'CONCERT_HALL',
    website: 'https://swg3.tv',
    vibeTags: ['live-music', 'arts', 'warehouse', 'electronic'],
  },
  {
    googlePlaceId: 'slug-the-garage',
    name: 'The Garage',
    address: '490 Sauchiehall St, Glasgow G2 3LW',
    city: 'Glasgow',
    lat: 55.8672,
    lng: -4.2712,
    type: 'NIGHTCLUB',
    website: 'https://www.garageglasgow.co.uk',
    vibeTags: ['club-classic', 'student', 'pop', 'rnb'],
  },
  {
    googlePlaceId: 'slug-slouch',
    name: 'Slouch',
    address: '206 Woodlands Rd, Glasgow G3 6LN',
    city: 'Glasgow',
    lat: 55.8703,
    lng: -4.2762,
    type: 'BAR',
    phone: '0141 332 1711',
    vibeTags: ['cocktails', 'relaxed', 'indie', 'local-favourite'],
  },
  {
    googlePlaceId: 'slug-oran-mor',
    name: 'Òran Mór',
    address: 'Top of Byres Rd, Glasgow G12 8QX',
    city: 'Glasgow',
    lat: 55.8749,
    lng: -4.2896,
    type: 'BAR',
    website: 'https://www.oran-mor.co.uk',
    phone: '0141 357 6200',
    vibeTags: ['live-music', 'theatre', 'whisky', 'west-end'],
  },
  {
    googlePlaceId: 'slug-broadcast',
    name: 'Broadcast',
    address: '427 Sauchiehall Lane, Glasgow G2 3LW',
    city: 'Glasgow',
    lat: 55.8676,
    lng: -4.2702,
    type: 'BAR',
    website: 'https://broadcastglasgow.com',
    vibeTags: ['indie', 'alternative', 'live-music', 'cosy'],
  },
  {
    googlePlaceId: 'slug-hug-and-pint',
    name: 'The Hug and Pint',
    address: '171 Great Western Rd, Glasgow G4 9AW',
    city: 'Glasgow',
    lat: 55.8722,
    lng: -4.2682,
    type: 'PUB',
    website: 'https://thehugandpint.com',
    phone: '0141 331 1901',
    vibeTags: ['vegan', 'live-music', 'welcoming', 'eclectic'],
  },
  {
    googlePlaceId: 'slug-stereo',
    name: 'Stereo',
    address: '20-28 Renfield Lane, Glasgow G2 5AR',
    city: 'Glasgow',
    lat: 55.8622,
    lng: -4.2590,
    type: 'BAR',
    website: 'https://www.stereocafebar.com',
    phone: '0141 222 2254',
    vibeTags: ['vegan', 'alternative', 'dj-nights', 'city-centre'],
  },
]

async function main() {
  console.log('Seeding Glasgow venues...')

  for (const venue of venues) {
    const result = await prisma.venue.upsert({
      where: { googlePlaceId: venue.googlePlaceId },
      update: {
        name: venue.name,
        address: venue.address,
        city: venue.city,
        lat: venue.lat,
        lng: venue.lng,
        type: venue.type,
        phone: venue.phone,
        website: venue.website,
        vibeTags: venue.vibeTags,
      },
      create: venue,
    })
    console.log(`  ✓ ${result.name} (${result.id})`)
  }

  console.log(`\nDone — seeded ${venues.length} venues.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
