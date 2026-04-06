// scripts/seed-venues.mjs
// Run: node scripts/seed-venues.mjs
const API = 'https://api-production-f912.up.railway.app/api'

async function main() {
  console.log('Seeding Glasgow venues...')
  const res = await fetch(`${API}/admin/seed-venues`, { method: 'POST' })
  const json = await res.json()
  console.log(json)
}

main().catch(console.error)
