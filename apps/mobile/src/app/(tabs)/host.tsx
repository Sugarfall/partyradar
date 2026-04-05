import { useRouter } from 'expo-router'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useAuth } from '../_layout'

export default function HostScreen() {
  const router = useRouter()
  const { dbUser } = useAuth()

  if (!dbUser) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Host an Event</Text>
        <Text style={styles.subtitle}>Sign in to start hosting</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/auth')}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Host an Event</Text>
      <Text style={styles.subtitle}>Create and manage your events</Text>

      <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/events/create')}>
        <Text style={styles.createBtnText}>+ Create New Event</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Events</Text>
        <Text style={styles.cardSubtitle}>View and manage events you've hosted</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f', padding: 20 },
  center: { flex: 1, backgroundColor: '#0d0d0f', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fafafa', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#71717a', fontSize: 15, marginBottom: 24 },
  btn: { backgroundColor: '#a855f7', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  createBtn: { backgroundColor: '#a855f7', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: '#18181b', borderRadius: 12, borderWidth: 1, borderColor: '#3f3f46', padding: 16 },
  cardTitle: { color: '#fafafa', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardSubtitle: { color: '#71717a', fontSize: 13 },
})
