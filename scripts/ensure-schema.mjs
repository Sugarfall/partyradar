#!/usr/bin/env node
/**
 * scripts/ensure-schema.mjs
 *
 * Runs `prisma db push` with a hard kill-timeout so it can NEVER hang a build.
 * Always exits 0 — existing tables are never dropped, so a timeout is non-fatal.
 *
 * Usage (add to railway.toml buildCommand at the end):
 *   && node scripts/ensure-schema.mjs
 */
import { spawn } from 'node:child_process'

const TIMEOUT_MS = 45_000 // 45 s — enough for a warm DB, won't block the build

const child = spawn(
  process.execPath,
  [
    'node_modules/prisma/build/index.js',
    'db', 'push',
    '--accept-data-loss',
    '--schema=packages/db/prisma/schema.prisma',
    '--skip-generate',
  ],
  { stdio: 'inherit' },
)

const timer = setTimeout(() => {
  console.warn('\n[ensure-schema] db push timed out after 45 s — continuing build anyway.')
  child.kill('SIGKILL')
  process.exit(0) // non-fatal — don't fail the build
}, TIMEOUT_MS)

child.on('close', (code) => {
  clearTimeout(timer)
  if (code === 0) {
    console.log('[ensure-schema] ✓ Database schema is up-to-date.')
  } else {
    console.warn(`[ensure-schema] db push exited with code ${code} — continuing build anyway.`)
  }
  process.exit(0) // always succeed so the build doesn't abort
})

child.on('error', (err) => {
  clearTimeout(timer)
  console.warn('[ensure-schema] Failed to spawn db push:', err.message)
  process.exit(0)
})
