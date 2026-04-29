/**
 * End-to-end encryption for PartyRadar DMs.
 * Uses ECDH (P-256) for key exchange + AES-GCM (256-bit) for message encryption.
 * Private key never leaves the browser — stored in IndexedDB.
 * Public key is uploaded to the server so the other party can encrypt to you.
 */

const DB_NAME = 'partyradar-e2e'
const DB_VERSION = 1
const STORE = 'keys'
const PK_KEY = 'privateKey'
const PUB_KEY = 'publicKey'

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function dbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ── Base64 helpers ─────────────────────────────────────────────────────────────

function bufToB64(buf: ArrayBuffer): string {
  // Avoid spread (...new Uint8Array(buf)) which crashes V8 via "Maximum call stack
  // size exceeded" for buffers larger than ~65 KB — use an explicit loop instead.
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// ── Key generation & storage ───────────────────────────────────────────────────

export interface KeyPairJWK {
  privateKey: JsonWebKey
  publicKey: JsonWebKey
}

export async function getOrCreateKeyPair(): Promise<{ publicKeyJWK: JsonWebKey }> {
  // Check if we already have a key pair
  const existing = await dbGet<JsonWebKey>(PK_KEY)
  if (existing) {
    const pubJWK = await dbGet<JsonWebKey>(PUB_KEY)
    if (pubJWK) return { publicKeyJWK: pubJWK }
  }

  // Generate new ECDH P-256 key pair
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )

  const privateKeyJWK = await crypto.subtle.exportKey('jwk', kp.privateKey)
  const publicKeyJWK = await crypto.subtle.exportKey('jwk', kp.publicKey)

  await dbPut(PK_KEY, privateKeyJWK)
  await dbPut(PUB_KEY, publicKeyJWK)

  return { publicKeyJWK }
}

/** Serialize public key to a string for server storage */
export function serializePublicKey(jwk: JsonWebKey): string {
  return JSON.stringify(jwk)
}

/** Deserialize public key string from server.
 *  Throws a descriptive error (rather than a bare SyntaxError) if the string
 *  is empty, null, or not valid JSON — callers catch this. */
export function deserializePublicKey(s: string): JsonWebKey {
  if (!s) throw new Error('Public key string is empty')
  try {
    return JSON.parse(s) as JsonWebKey
  } catch {
    throw new Error('Public key is malformed — cannot decrypt message')
  }
}

// ── Shared key derivation ──────────────────────────────────────────────────────

async function deriveSharedKey(
  myPrivateKeyJWK: JsonWebKey,
  theirPublicKeyJWK: JsonWebKey,
): Promise<CryptoKey> {
  const myPrivate = await crypto.subtle.importKey(
    'jwk',
    myPrivateKeyJWK,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  )
  const theirPublic = await crypto.subtle.importKey(
    'jwk',
    theirPublicKeyJWK,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublic },
    myPrivate,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// ── Encrypt / decrypt ──────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using ECDH-derived AES-GCM key.
 * Returns a string of the form: [E2E]<base64-iv>:<base64-ciphertext>
 */
export async function encryptMessage(
  plaintext: string,
  theirPublicKeyStr: string,
): Promise<string> {
  const myPrivateJWK = await dbGet<JsonWebKey>(PK_KEY)
  if (!myPrivateJWK) throw new Error('No local key pair — call getOrCreateKeyPair first')

  const theirPublicJWK = deserializePublicKey(theirPublicKeyStr)
  const sharedKey = await deriveSharedKey(myPrivateJWK, theirPublicJWK)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    new TextEncoder().encode(plaintext),
  )

  return `[E2E]${bufToB64(iv.buffer)}:${bufToB64(ciphertext)}`
}

/**
 * Decrypt an [E2E] ciphertext string.
 * Returns the plaintext or null if decryption fails.
 */
export async function decryptMessage(
  ciphertext: string,
  theirPublicKeyStr: string,
): Promise<string | null> {
  if (!ciphertext.startsWith('[E2E]')) return ciphertext // plaintext passthrough

  const myPrivateJWK = await dbGet<JsonWebKey>(PK_KEY)
  if (!myPrivateJWK) return '[Encrypted — open on your registered device]'

  try {
    const theirPublicJWK = deserializePublicKey(theirPublicKeyStr)
    const sharedKey = await deriveSharedKey(myPrivateJWK, theirPublicJWK)

    const [ivB64, ctB64] = ciphertext.slice(5).split(':')
    if (!ivB64 || !ctB64) return '[Malformed encrypted message]'

    const iv = b64ToBuf(ivB64)
    const ct = b64ToBuf(ctB64)

    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, ct)
    return new TextDecoder().decode(plain)
  } catch {
    return '[Could not decrypt — sent from another device]'
  }
}

export function isEncrypted(text: string): boolean {
  return text.startsWith('[E2E]')
}
