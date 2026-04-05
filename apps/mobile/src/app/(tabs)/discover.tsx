import { useState, useEffect } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import MapboxGL from '@rnmapbox/maps'
import { useRouter } from 'expo-router'
import * as Location from 'expo-location'
import { api } from '@/lib/api'
import type { Event, EventType } from '@partyradar/shared'
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS } from '@partyradar/shared'
import { EventCard } from '@/components/events/EventCard'

MapboxGL.setAccessToken(process.env['EXPO_PUBLIC_MAPBOX_TOKEN'] ?? '')

export default function DiscoverScreen() {
  const router = useRouter()
  const [view, setView] = useState<'map' | 'list'>('list')
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedType, setSelectedType] = useState<EventType | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        Location.getCurrentPositionAsync({}).then((loc) => {
          setUserLocation([loc.coords.longitude, loc.coords.latitude])
        })
      }
    })
  }, [])

  async function fetchEvents(type?: EventType | null) {
    try {
      const params = new URLSearchParams()
      if (type) params.set('type', type)
      if (userLocation) {
        params.set('lng', String(userLocation[0]))
        params.set('lat', String(userLocation[1]))
      }
      const res = await api.get<{ data: Event[] }>(`/events?${params}`)
      setEvents(res.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchEvents(selectedType) }, [selectedType, userLocation])

  const eventTypes: EventType[] = ['HOME_PARTY', 'CLUB_NIGHT', 'CONCERT']

  return (
    <View style={styles.container}>
      {/* View toggle */}
      <View style={styles.header}>
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'map' && styles.toggleActive]}
            onPress={() => setView('map')}
          >
            <Text style={[styles.toggleText, view === 'map' && styles.toggleTextActive]}>Map</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'list' && styles.toggleActive]}
            onPress={() => setView('list')}
          >
            <Text style={[styles.toggleText, view === 'list' && styles.toggleTextActive]}>List</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Type filter */}
      <View style={styles.typeFilter}>
        <TouchableOpacity
          style={[styles.typePill, !selectedType && styles.typePillActive]}
          onPress={() => setSelectedType(null)}
        >
          <Text style={[styles.typePillText, !selectedType && styles.typePillTextActive]}>All</Text>
        </TouchableOpacity>
        {eventTypes.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.typePill, selectedType === t && { borderColor: EVENT_TYPE_COLORS[t], backgroundColor: EVENT_TYPE_COLORS[t] + '22' }]}
            onPress={() => setSelectedType(selectedType === t ? null : t)}
          >
            <Text style={[styles.typePillText, selectedType === t && { color: EVENT_TYPE_COLORS[t] }]}>
              {EVENT_TYPE_LABELS[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Map view */}
      {view === 'map' && (
        <MapboxGL.MapView style={styles.map} styleURL={MapboxGL.StyleURL.Dark}>
          <MapboxGL.Camera
            zoomLevel={12}
            centerCoordinate={userLocation ?? [-74.006, 40.7128]}
            animationMode="flyTo"
          />
          {events.map((event) => (
            <MapboxGL.PointAnnotation
              key={event.id}
              id={event.id}
              coordinate={[event.lng, event.lat]}
              onSelected={() => router.push(`/events/${event.id}`)}
            >
              <View style={[styles.marker, { backgroundColor: EVENT_TYPE_COLORS[event.type] }]}>
                <Text style={styles.markerText}>
                  {event.type === 'HOME_PARTY' ? '🏠' : event.type === 'CLUB_NIGHT' ? '🎵' : '🎤'}
                </Text>
              </View>
            </MapboxGL.PointAnnotation>
          ))}
        </MapboxGL.MapView>
      )}

      {/* List view */}
      {view === 'list' && (
        loading ? (
          <ActivityIndicator color="#a855f7" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={events}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => (
              <EventCard event={item} onPress={() => router.push(`/events/${item.id}`)} />
            )}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchEvents(selectedType) }}
                tintColor="#a855f7"
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No events found nearby</Text>
              </View>
            }
          />
        )
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  toggle: { flexDirection: 'row', backgroundColor: '#27272a', borderRadius: 8, padding: 2 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  toggleActive: { backgroundColor: '#a855f7' },
  toggleText: { color: '#71717a', fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: '#fff' },
  typeFilter: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'nowrap' },
  typePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#3f3f46' },
  typePillActive: { borderColor: '#a855f7', backgroundColor: '#a855f722' },
  typePillText: { color: '#71717a', fontSize: 12, fontWeight: '600' },
  typePillTextActive: { color: '#a855f7' },
  map: { flex: 1 },
  marker: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  markerText: { fontSize: 16 },
  list: { padding: 16, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#71717a', fontSize: 15 },
})
