import { useEffect, useState, createContext, useContext } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, type User } from '@/lib/firebase'
import { api } from '@/lib/api'
import * as Notifications from 'expo-notifications'
import type { User as DBUser } from '@partyradar/shared'

// ─── Auth Context ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  firebaseUser: User | null
  dbUser: DBUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export default function RootLayout() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [dbUser, setDbUser] = useState<DBUser | null>(null)
  const [loading, setLoading] = useState(true)

  async function syncUser(user: User) {
    try {
      const res = await api.post<{ data: DBUser }>('/auth/sync')
      setDbUser(res.data)

      // Register FCM token
      const { status } = await Notifications.requestPermissionsAsync()
      if (status === 'granted') {
        const token = await Notifications.getExpoPushTokenAsync()
        api.post('/notifications/fcm-token', { token: token.data }).catch(() => {})
      }
    } catch (err) {
      console.error('Sync failed:', err)
    }
  }

  useEffect(() => {
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

  async function logout() {
    await signOut(auth)
    setDbUser(null)
  }

  async function refreshUser() {
    if (firebaseUser) await syncUser(firebaseUser)
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthContext.Provider value={{ firebaseUser, dbUser, loading, signIn, signUp, logout, refreshUser }}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerStyle: { backgroundColor: '#0d0d0f' }, headerTintColor: '#fff' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/index" options={{ headerShown: false }} />
            <Stack.Screen name="events/[id]" options={{ title: 'Event' }} />
            <Stack.Screen name="events/create" options={{ title: 'Create Event' }} />
            <Stack.Screen name="tickets/[id]" options={{ title: 'Ticket' }} />
          </Stack>
        </AuthContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
