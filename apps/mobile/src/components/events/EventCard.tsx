import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import type { Event } from '@partyradar/shared'
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, ALCOHOL_POLICY_LABELS } from '@partyradar/shared'

interface Props {
  event: Event
  onPress: () => void
}

export function EventCard({ event, onPress }: Props) {
  const color = EVENT_TYPE_COLORS[event.type] ?? '#a855f7'
  const isFree = event.price === 0

  return (
    <TouchableOpacity onPress={onPress} style={styles.card}>
      {event.coverImageUrl && (
        <Image source={{ uri: event.coverImageUrl }} style={styles.cover} />
      )}
      <View style={styles.body}>
        <View style={styles.row}>
          <View style={[styles.badge, { borderColor: color, backgroundColor: color + '22' }]}>
            <Text style={[styles.badgeText, { color }]}>{EVENT_TYPE_LABELS[event.type]}</Text>
          </View>
          {event.isFeatured && (
            <View style={[styles.badge, { borderColor: '#f59e0b', backgroundColor: '#f59e0b22' }]}>
              <Text style={[styles.badgeText, { color: '#f59e0b' }]}>⭐ Featured</Text>
            </View>
          )}
        </View>

        <Text style={styles.name} numberOfLines={2}>{event.name}</Text>
        <Text style={styles.host}>by {event.host.displayName}</Text>

        <View style={styles.row}>
          <Text style={styles.meta}>📅 {new Date(event.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
        </View>
        <Text style={styles.meta}>📍 {event.neighbourhood}</Text>

        <View style={[styles.row, styles.footer]}>
          <Text style={[styles.price, isFree && { color: '#4ade80' }]}>
            {isFree ? 'Free' : `$${event.price.toFixed(2)}`}
          </Text>
          <Text style={styles.meta}>{event.guestCount}/{event.capacity} guests</Text>
        </View>

        {event.vibeTags.length > 0 && (
          <View style={styles.row}>
            {event.vibeTags.slice(0, 3).map((tag) => (
              <Text key={tag} style={styles.vibeTag}>#{tag}</Text>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#18181b', borderRadius: 12, borderWidth: 1, borderColor: '#3f3f46', overflow: 'hidden' },
  cover: { width: '100%', height: 140 },
  body: { padding: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  name: { color: '#fafafa', fontSize: 15, fontWeight: '700', marginTop: 2 },
  host: { color: '#71717a', fontSize: 12 },
  meta: { color: '#71717a', fontSize: 12 },
  price: { color: '#fff', fontSize: 13, fontWeight: '700' },
  footer: { justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#3f3f46' },
  vibeTag: { color: '#a1a1aa', fontSize: 11, backgroundColor: '#27272a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
})
