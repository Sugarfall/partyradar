import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged as _onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'],
  authDomain: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'],
  projectId: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
  appId: process.env['NEXT_PUBLIC_FIREBASE_APP_ID'],
  messagingSenderId: process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'],
}

// Safe initialization — no-op when API key is missing (e.g. no .env.local yet)
function initFirebase() {
  try {
    if (!firebaseConfig.apiKey) return getApps()[0] ?? null
    return getApps().length ? getApps()[0]! : initializeApp(firebaseConfig)
  } catch {
    return null
  }
}

const app = initFirebase()
const _realAuth = app ? getAuth(app) : null

export const auth = _realAuth ?? ({
  currentUser: null,
} as unknown as ReturnType<typeof getAuth>)
export const googleProvider = new GoogleAuthProvider()
googleProvider.addScope('email')
googleProvider.addScope('profile')
googleProvider.setCustomParameters({ prompt: 'select_account' })

export const appleProvider = new OAuthProvider('apple.com')
appleProvider.addScope('email')
appleProvider.addScope('name')

/** True when running on a mobile browser (popups get blocked) */
function isMobile() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

// ── Dev mock auth (used when no Firebase API key is configured) ──────────────
const MOCK_USERS_KEY = 'partyradar_mock_users'
const MOCK_SESSION_KEY = 'partyradar_mock_session'

type MockUser = { uid: string; email: string; password: string }

function getMockUsers(): Record<string, MockUser> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(MOCK_USERS_KEY) ?? '{}') } catch { return {} }
}

function saveMockUsers(users: Record<string, MockUser>) {
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users))
}

function makeMockUserRecord(email: string): User {
  return { uid: `mock_${email}`, email, displayName: null, photoURL: null, emailVerified: true, getIdToken: async () => 'mock-token' } as unknown as User
}

export const DEV_MODE = !firebaseConfig.apiKey

// Wrap onAuthStateChanged — uses mock session in dev mode
export function onAuthStateChanged(
  authInstance: ReturnType<typeof getAuth>,
  callback: (user: User | null) => void
): () => void {
  if (DEV_MODE) {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(MOCK_SESSION_KEY) : null
      const session: MockUser | null = raw ? JSON.parse(raw) : null
      callback(session ? makeMockUserRecord(session.email) : null)
    } catch {
      callback(null)
    }
    return () => {}
  }
  if (!_realAuth) { callback(null); return () => {} }
  return _onAuthStateChanged(authInstance, callback)
}

export async function getFCMToken() {
  try {
    if (!app) return null
    const supported = await isSupported()
    if (!supported) return null
    const messaging = getMessaging(app)
    return await getToken(messaging, { vapidKey: process.env['NEXT_PUBLIC_FIREBASE_VAPID_KEY'] })
  } catch {
    return null
  }
}

// Mock-aware wrappers
export async function signInWithEmailAndPassword(
  authInstance: ReturnType<typeof getAuth>,
  email: string,
  password: string
): Promise<{ user: User }> {
  if (DEV_MODE) {
    const users = getMockUsers()
    const found = Object.values(users).find((u) => u.email === email)
    if (!found || found.password !== password) throw new Error('auth/invalid-credential')
    localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(found))
    return { user: makeMockUserRecord(email) }
  }
  const { signInWithEmailAndPassword: _fn } = await import('firebase/auth')
  return _fn(authInstance, email, password)
}

export async function createUserWithEmailAndPassword(
  authInstance: ReturnType<typeof getAuth>,
  email: string,
  password: string
): Promise<{ user: User }> {
  if (DEV_MODE) {
    const users = getMockUsers()
    if (Object.values(users).find((u) => u.email === email)) throw new Error('auth/email-already-in-use')
    const newUser: MockUser = { uid: `mock_${Date.now()}`, email, password }
    users[newUser.uid] = newUser
    saveMockUsers(users)
    localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(newUser))
    return { user: makeMockUserRecord(email) }
  }
  const { createUserWithEmailAndPassword: _fn } = await import('firebase/auth')
  return _fn(authInstance, email, password)
}

export async function signInWithPopup(
  authInstance: ReturnType<typeof getAuth>,
  provider: GoogleAuthProvider
): Promise<{ user: User }> {
  if (DEV_MODE) throw new Error('Google sign-in not available in dev mode — use email/password')
  const { signInWithPopup: _popupFn, signInWithRedirect: _redirectFn } = await import('firebase/auth')
  // Mobile browsers block popups — use redirect flow instead
  if (isMobile()) {
    await _redirectFn(authInstance, provider)
    // signInWithRedirect never resolves — page will reload, result picked up by getRedirectResult
    return new Promise(() => {})
  }
  return _popupFn(authInstance, provider)
}

export async function signInWithApple(
  authInstance: ReturnType<typeof getAuth>
): Promise<{ user: User }> {
  if (DEV_MODE) throw new Error('Apple sign-in not available in dev mode')
  const { signInWithPopup: _fn } = await import('firebase/auth')
  return _fn(authInstance, appleProvider)
}

export async function sendEmailVerification(user: User): Promise<void> {
  if (DEV_MODE) return
  const { sendEmailVerification: _fn } = await import('firebase/auth')
  return _fn(user)
}

export async function signOut(authInstance: ReturnType<typeof getAuth>): Promise<void> {
  if (DEV_MODE) {
    localStorage.removeItem(MOCK_SESSION_KEY)
    return
  }
  const { signOut: _fn } = await import('firebase/auth')
  return _fn(authInstance)
}

export type { User }
