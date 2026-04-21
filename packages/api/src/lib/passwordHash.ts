import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

const KEY_LEN = 64
const SALT_BYTES = 16

/**
 * Hash a plaintext password with scrypt.
 * Returns a self-describing string: `scrypt$<saltHex>$<hashHex>`.
 * Legacy plaintext passwords remain readable via `verifyPassword`.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const hash = await scrypt(plain, salt, KEY_LEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

/**
 * Verify a plaintext password against a stored value.
 * Supports the new `scrypt$...$...` format and falls back to a timing-safe
 * plaintext compare so older, un-migrated rows continue to work.
 */
export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$')
    if (parts.length !== 3) return false
    try {
      const salt = Buffer.from(parts[1]!, 'hex')
      const expected = Buffer.from(parts[2]!, 'hex')
      const actual = await scrypt(plain, salt, expected.length)
      return actual.length === expected.length && timingSafeEqual(actual, expected)
    } catch {
      return false
    }
  }
  // Legacy plaintext — timing-safe compare then treat as valid, caller may re-hash.
  const a = Buffer.from(plain)
  const b = Buffer.from(stored)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** True if the stored value is already in the new hashed format. */
export function isHashed(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith('scrypt$')
}
