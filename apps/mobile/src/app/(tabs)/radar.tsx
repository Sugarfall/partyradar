import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native'
import MapboxGL from '@rnmapbox/maps'
import * as Location from 'expo-location'
import { api } from '@/lib/api'
import { useAuth } from '../_layout'
import type { CelebritySighting } from '@partyradar/shared'
import { TIERS } from '@partyradar/shared'
import type { SubscriptionTier } from '@partyradar/shared'

export default function RadarScreen() {
  const { dbUser } = useAuth()
  const [sightings, setSightings] = useState<CelebritySighting[]>([])
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(true)

  const canUseRadar = dbUser ? TIERS[dbUser.subscriptionTier as SubscriptionTier].radar : false

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        Location.getCurrentPositionAsync({}).then((loc) => {
          setUserLocation([loc.coords.longitude, loc.coords.latitude])
        })
      }
    })
    fetchSightings()
  }, [])

  async function fetchSightings() {
    try {
      const res = await api.get<{ data: CelebritySighting[] }>('/radar')
      setSightings(res.data)
    } finally {
      setLoading(false)
    }
  }

  async function handleVote(id: string, isUpvote: boolean) {
    if (!canUseRadar) return
    try {
      await api.post(`/radar/${id}/vote`, { isUpvote })
      fetchSightings()
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to vote')
    }
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapboxGL.MapView style={styles.map} styleURL={MapboxGL.StyleURL.Dark}>
        <MapboxGL.Camera
          zoomLevel={12}
          centerCoordinate={userLocation ?? [-74.006, 40.7128]}
          animationMode="flyTo"
        />
        {sightings.map((s) => (
          <MapboxGL.PointAnnotation
            key={s.id}
            id={s.id}
            coordinate={[s.lng, s.lat]}
          >
            <View style={styles.marker}>
              <Text style={{ fontSize: 18 }}>⭐</Text>
            </View>
          </MapboxGL.PointAnnotation>
        ))}
      </MapboxGL.MapView>

      {/* Sightings list */}
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>⭐ Celebrity Radar</Text>
        {!canUseRadar ? (
          <Text style={styles.gateText}>Upgrade to Pro or Premium to report and vote on sightings</Text>
        ) : (
          <FlatList
            data={sightings}
            keyExtractor={(s) => s.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
            renderItem={({ item: s }) => {
              const remaining = Math.max(0, new Date(s.expiresAt).getTime() - Date.now())
              const mins = Math.ceil(remaining / 60000)
              return (
                <View style={styles.sightingCard}>
                  <Text style={styles.sightingCeleb}>{s.celebrity}</Text>
                  <Text style={styles.sightingMeta}>{mins}m left</Text>
                  {s.description && (
                    <Text style={styles.sightingDesc} numberOfLines={2}>{s.description}</Text>
                  )}
                  <View style={styles.voteRow}>
                    <TouchableOpacity
                      style={[styles.voteBtn, s.userVote === 'up' && styles.voteBtnUp]}
                      onPress={() => handleVote(s.id, true)}
                    >
                      <Text style={{ color: s.userVote === 'up' ? '#4ade80' : '#71717a' }}>👍 {s.upvotes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.voteBtn, s.userVote === 'down' && styles.voteBtnDown]}
                      onPress={() => handleVote(s.id, false)}
                    >
                      <Text style={{ color: s.userVote === 'down' ? '#f87171' : '#71717a' }}>👎 {s.downvotes}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            }}
            ListEmptyComponent={
              <Text style={styles.gateText}>No active sightings yet</Text>
            }
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  map: { flex: 1 },
  marker: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f59e0b', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: '#18181b', borderTopWidth: 1, borderTopColor: '#3f3f46', padding: 16, maxHeight: 180 },
  panelTitle: { color: '#fafafa', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  gateText: { color: '#71717a', fontSize: 13 },
  sightingCard: { backgroundColor: '#27272a', borderRadius: 10, padding: 12, width: 180, borderWidth: 1, borderColor: '#3f3f46' },
  sightingCeleb: { color: '#f59e0b', fontSize: 14, fontWeight: '700' },
  sightingMeta: { color: '#71717a', fontSize: 11, marginTop: 2 },
  sightingDesc: { color: '#a1a1aa', fontSize: 12, marginTop: 4 },
  voteRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  voteBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#18181b', borderWidth: 1, borderColor: '#3f3f46' },
  voteBtnUp: { borderColor: '#4ade80' },
  voteBtnDown: { borderColor: '#f87171' },
})
