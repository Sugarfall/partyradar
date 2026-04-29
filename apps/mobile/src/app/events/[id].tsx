import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '@/lib/api'
import { useAuth } from '../_layout'
import type { Event } from '@partyradar/shared'
import { ALCOHOL_POLICY_LABELS, AGE_RESTRICTION_LABELS, EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from '@partyradar/shared'

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { dbUser } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [rsvpLoading, setRsvpLoading] = useState(false)

  useEffect(() => {
    api.get<{ data: Event }>(`/events/${id}`)
      .then((res) => setEvent(res.data))
      .finally(() => setLoading(false))
  }, [id])

  async function handleRSVP() {
    if (!dbUser) { router.push('/auth'); return }
    setRsvpLoading(true)
    try {
      await api.post(`/events/${id}/guests/rsvp`)
      Alert.alert('Confirmed! 🎉', `You're going to ${event?.name}`)
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'RSVP failed')
    } finally {
      setRsvpLoading(false)
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#a855f7" size="large" /></View>
  }

  if (!event) {
    return <View style={styles.center}><Text style={{ color: '#fafafa' }}>Event not found</Text></View>
  }

  const color = EVENT_TYPE_COLORS[event.type] ?? '#a855f7'
  const isFree = event.price === 0

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        {event.coverImageUrl && (
          <Image source={{ uri: event.coverImageUrl }} style={styles.cover} />
        )}

        <View style={styles.content}>
          <View style={[styles.badge, { borderColor: color, backgroundColor: color + '22' }]}>
            <Text style={[styles.badgeText, { color }]}>{EVENT_TYPE_LABELS[event.type]}</Text>
          </View>

          <Text style={styles.name}>{event.name}</Text>
          <Text style={styles.host}>Hosted by {event.host?.displayName ?? 'Unknown Host'}</Text>

          <View style={styles.metaGrid}>
            <MetaItem label="Date" value={new Date(event.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} />
            <MetaItem label="Location" value={event.showNeighbourhoodOnly ? event.neighbourhood : event.address} />
            <MetaItem label="Capacity" value={`${event.guestCount}/${event.capacity}`} />
            <MetaItem label="Alcohol" value={ALCOHOL_POLICY_LABELS[event.alcoholPolicy]} />
            {event.ageRestriction !== 'ALL_AGES' && (
              <MetaItem label="Age" value={AGE_RESTRICTION_LABELS[event.ageRestriction]} />
            )}
          </View>

          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.description}>{event.description}</Text>

          {event.houseRules && (
            <>
              <Text style={styles.sectionTitle}>House Rules</Text>
              <Text style={styles.description}>{event.houseRules}</Text>
            </>
          )}

          {event.vibeTags.length > 0 && (
            <View style={styles.tagRow}>
              {event.vibeTags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>#{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.cta}>
        <TouchableOpacity
          style={[styles.ctaBtn, rsvpLoading && { opacity: 0.7 }]}
          onPress={handleRSVP}
          disabled={rsvpLoading}
        >
          <Text style={styles.ctaBtnText}>
            {rsvpLoading ? 'Loading...' : isFree ? 'RSVP — Free' : `Buy Ticket — $${event.price.toFixed(2)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  center: { flex: 1, backgroundColor: '#0d0d0f', alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', height: 220 },
  content: { padding: 20, gap: 12 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  name: { color: '#fafafa', fontSize: 24, fontWeight: '800' },
  host: { color: '#71717a', fontSize: 14 },
  metaGrid: { gap: 8, marginVertical: 8 },
  metaItem: { backgroundColor: '#27272a', borderRadius: 10, padding: 12 },
  metaLabel: { color: '#71717a', fontSize: 11, marginBottom: 2 },
  metaValue: { color: '#fafafa', fontSize: 14, fontWeight: '500' },
  sectionTitle: { color: '#fafafa', fontSize: 16, fontWeight: '700', marginTop: 8 },
  description: { color: '#a1a1aa', fontSize: 14, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: '#27272a', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#3f3f46' },
  tagText: { color: '#a1a1aa', fontSize: 12 },
  cta: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0d0d0f', borderTopWidth: 1, borderTopColor: '#27272a', padding: 16 },
  ctaBtn: { backgroundColor: '#a855f7', padding: 16, borderRadius: 12, alignItems: 'center' },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
