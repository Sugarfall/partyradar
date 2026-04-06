// scripts/seed-activity.mjs
// Run: node scripts/seed-activity.mjs
// Tries Railway first, falls back to localhost:4000
const RAILWAY = 'https://api-production-f912.up.railway.app/api'
const LOCAL   = 'http://localhost:4000/api'

async function getBase() {
  try {
    const res = await fetch(`${RAILWAY}/health`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) { console.log('✓ Using Railway backend'); return RAILWAY }
  } catch {}
  console.log('⚠ Railway unreachable — trying localhost:4000')
  try {
    const res = await fetch(`${LOCAL}/health`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) { console.log('✓ Using local backend'); return LOCAL }
  } catch {}
  throw new Error('No API reachable. Start the local server: cd PartyRadar && npx tsx packages/api/src/index.ts')
}

async function main() {
  const API = await getBase()
  console.log('\nSeeding Glasgow nightlife activity...')

  // First seed venues if not done yet
  const venueRes = await fetch(`${API}/admin/seed-venues`, { method: 'POST' })
  const venueJson = await venueRes.json()
  console.log('Venues:', venueJson.message ?? venueJson)

  // Then seed activity
  const actRes = await fetch(`${API}/admin/seed-activity`, { method: 'POST' })
  const actJson = await actRes.json()
  console.log('Activity:', actJson)
}

main().catch(console.error)
