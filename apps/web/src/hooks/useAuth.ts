'use client'

import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithApple as firebaseSignInWithApple,
  googleProvider,
  signOut,
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

  async function syncUser(user: User) {
    // In dev mode (no Firebase config), use a local mock DB user
    if (DEV_MODE) {
      setDbUser(makeMockDbUser(user.email ?? 'demo@partyradar.app'))
      return
    }
    try {
      const res = await api.post<{ data: DBUser }>('/auth/sync')
      setDbUser(res.data)

      // Register FCM token
      const token = await getFCMToken()
      if (token) {
        api.post('/notifications/fcm-token', { token }).catch(() => {})
      }
    } catch (err) {
      // API not running — fall back to mock so UI stays functional
      setDbUser(makeMockDbUser(user.email ?? 'demo@partyradar.app'))
    }
  }

  useEffect(() => {
    // Pick up Google redirect result (mobile flow — page reloads after sign-in)
    if (!DEV_MODE && auth.currentUser === null) {
      getRedirectResult(auth).then(async (result) => {
        if (result?.user) await syncUser(result.user)
      }).catch(() => {})
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        await syncUser(user)
      } else {
        setDbUser(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function signIn(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    await syncUser(cred.user)
  }

  async function signUp(email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await syncUser(cred.user)
  }

  async function signInWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider)
    await syncUser(cred.user)
  }

  async function signInWithApple() {
    const cred = await firebaseSignInWithApple(auth)
    await syncUser(cred.user)
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

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
