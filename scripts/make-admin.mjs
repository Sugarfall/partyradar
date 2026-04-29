// One-off script: make a user admin by username
// Usage: node scripts/make-admin.mjs <username>
import { PrismaClient } from '@prisma/client'

const username = process.argv[2]
if (!username) {
  console.error('Usage: node scripts/make-admin.mjs <username>')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true, username: true, displayName: true, email: true, firebaseUid: true, isAdmin: true, appRole: true },
  })

  if (!user) {
    console.error(`❌ User not found: ${username}`)
    process.exit(1)
  }

  console.log(`Found user: @${user.username} (${user.displayName}) — ${user.email}`)
  console.log(`  Current: isAdmin=${user.isAdmin}, appRole=${user.appRole}`)
  console.log(`  Firebase UID: ${user.firebaseUid}`)

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: true, appRole: 'ADMIN' },
    select: { id: true, username: true, isAdmin: true, appRole: true, firebaseUid: true },
  })

  console.log(`\n✅ Done! @${updated.username} is now ADMIN`)
  console.log(`  isAdmin=${updated.isAdmin}, appRole=${updated.appRole}`)
  console.log(`\n⚠️  IMPORTANT: Add this Firebase UID to ADMIN_FIREBASE_UIDS on Railway so the status persists across logins:`)
  console.log(`  ${updated.firebaseUid}`)
} finally {
  await prisma.$disconnect()
}
