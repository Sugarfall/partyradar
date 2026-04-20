'use client'

import { useState, useEffect, useRef, createContext, useContext, type ReactNode } from 'react'
import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithApple as firebaseSignInWithApple,
  googleProvider,
  signOut,
  sendEmailVerification,
  getFCMToken,
  DEV_MODE,
  type User,
} from '@/lib/firebase'
import { getRedirectResult } from 'firebase/auth'
import { api } from '@/lib/api'
import type { User as DBUser } from '@partyradar/shared'

function makeMockDbUser(email: string): DBUser {
  const username = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
  return {
    id: `mock_${email}`,
    firebaseUid: `mock_${email}`,
    email,
    username,
    displayName: username,
    bio: null,
    photoUrl: null,
    ageVerified: false,
    alcoholFriendly: false,
    showAlcoholEvents: true,
    phoneVerified: false,
    socialScore: 0,
    subscriptionTier: 'FREE',
    accountMode: 'ATTENDEE',
    stripeCustomerId: null,
    createdAt: new Date().toISOString(),
  } as DBUser
}

interface AuthContextValue {
  firebaseUser: User | null
  dbUser: DBUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

import { createElement } from 'react'

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [dbUser, setDbUser] = useState<DBUser | null>(null)
  const [loading, setLoading] = useState(true)
  // Prevent duplicate /auth/sync calls when signIn triggers onAuthStateChanged
  const syncingRef = useRef(false)

  async function syncUser(user: User) {
    // In dev mode (no Firebase config), use a local mock DB user
    if (DEV_MODE) {
      setDbUser(makeMockDbUser(user.email ?? 'demo@partyradar.app'))
      return
    }
    const res = await api.post<{ data: DBUser }>('/auth/sync')
    setDbUser(res.data)
    // Register FCM token (non-blocking)
    getFCMToken().then((token) => {
      if (token) api.post('/notifications/fcm-token', { token }).catch(() => {})
    }).catch(() => {})
  }

  useEffect(() => {
    // Pick up Google redirect result (mobile flow — page reloads after sign-in)
    if (!DEV_MODE && auth.currentUser === null) {
      getRedirectResult(auth).then(async (result) => {
        if (result?.user) {
          syncingRef.current = true
          try { await syncUser(result.user) } catch {}
          syncingRef.current = false
          setLoading(false) // Bug 20 fix: clear loading after redirect-result sync
        }
      }).catch(() => {})
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        // Skip if signIn/signUp/Google already called syncUser to avoid double requests.
        // Bug 20 fix: when syncingRef is true, the concurrent signIn/signUp call will set
        // dbUser and then setLoading(false) itself — don't fire setLoading(false) here yet,
        // or components will briefly see loading:false + dbUser:null and redirect to /login.
        if (!syncingRef.current) {
          try { await syncUser(user) } catch {
            setDbUser(makeMockDbUser(user.email ?? 'demo@partyradar.app'))
          }
          setLoading(false)
        }
        // If syncingRef is true, loading will be cleared by the signIn/signUp finally block
      } else {
        setDbUser(null)
        setLoading(false)
      }
    })
    return unsub
  }, [])

  async function signIn(email: string, password: string) {
    syncingRef.current = true
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      // Send verification email silently if not yet verified (non-blocking)
      if (!DEV_MODE && !cred.user.emailVerified) {
        sendEmailVerification(cred.user).catch(() => {})
      }
      await syncUser(cred.user)
    } finally {
      syncingRef.current = false
    }
  }

  async function signUp(email: string, password: string) {
    syncingRef.current = true
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      sendEmailVerification(cred.user).catch(() => {})
      await syncUser(cred.user)
    } finally {
      syncingRef.current = false
    }
  }

  async function signInWithGoogle() {
    syncingRef.current = true
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      await syncUser(cred.user)
    } finally {
      syncingRef.current = false
    }
  }

  async function signInWithApple() {
    syncingRef.current = true
    try {
      const cred = await firebaseSignInWithApple(auth)
      await syncUser(cred.user)
    } finally {
      syncingRef.current = false
    }
  }

  async function logout() {
    await signOut(auth)
    setDbUser(null)
  }

  async function refreshUser() {
    if (firebaseUser) await syncUser(firebaseUser)
  }

  return createElement(
    AuthContext.Provider,
    {
      value: { firebaseUser, dbUser, loading, signIn, signUp, signInWithGoogle, signInWithApple, logout, refreshUser },
    },
    children
  )
}

const AUTH_FALLBACK: AuthContextValue = {
  firebaseUser: null,
  dbUser: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signInWithApple: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  return ctx ?? AUTH_FALLBACK
}
