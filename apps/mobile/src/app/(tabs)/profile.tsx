import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../_layout'

export default function ProfileScreen() {
  const router = useRouter()
  const { dbUser, logout } = useAuth()

  if (!dbUser) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Sign In to PartyRadar</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/auth')}>
          <Text style={styles.btnText}>Sign In / Sign Up</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{dbUser.displayName[0]}</Text>
        </View>
        <Text style={styles.name}>{dbUser.displayName}</Text>
        <Text style={styles.username}>@{dbUser.username}</Text>
        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>{dbUser.subscriptionTier}</Text>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.menu}>
        <MenuItem label="My Tickets" onPress={() => router.push('/tickets/my')} />
        <MenuItem label="Subscription" onPress={() => {}} />
        <MenuItem label="Age Verification" onPress={() => {}} />
        <MenuItem label="Settings" onPress={() => {}} />
        <MenuItem label="Sign Out" onPress={logout} danger />
      </View>
    </ScrollView>
  )
}

function MenuItem({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Text style={[styles.menuLabel, danger && { color: '#f87171' }]}>{label}</Text>
      <Text style={{ color: '#3f3f46' }}>›</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  center: { flex: 1, backgroundColor: '#0d0d0f', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  avatarSection: { alignItems: 'center', paddingVertical: 32 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#a855f722', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#a855f7', fontSize: 32, fontWeight: '700' },
  name: { color: '#fafafa', fontSize: 20, fontWeight: '700' },
  username: { color: '#71717a', fontSize: 14, marginTop: 4 },
  tierBadge: { marginTop: 8, backgroundColor: '#27272a', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: '#3f3f46' },
  tierText: { color: '#a855f7', fontSize: 12, fontWeight: '600' },
  menu: { marginHorizontal: 16, backgroundColor: '#18181b', borderRadius: 12, borderWidth: 1, borderColor: '#3f3f46', overflow: 'hidden' },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  menuLabel: { color: '#fafafa', fontSize: 15 },
  title: { color: '#fafafa', fontSize: 22, fontWeight: '700' },
  btn: { backgroundColor: '#a855f7', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
