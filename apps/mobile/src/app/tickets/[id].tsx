import { useEffect, useState } from 'react'
import { View, Text, Image, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/lib/api'
import type { Ticket } from '@partyradar/shared'
import QRCode from 'react-native-qrcode-svg'

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [ticket, setTicket] = useState<(Ticket & { qrDataUrl?: string }) | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ data: Ticket }>(`/tickets/${id}`)
      .then((res) => setTicket(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#a855f7" size="large" />
      </View>
    )
  }

  if (!ticket) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Ticket not found</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Event cover */}
      {ticket.event.coverImageUrl && (
        <Image source={{ uri: ticket.event.coverImageUrl }} style={styles.cover} />
      )}

      <View style={styles.card}>
        <Text style={styles.eventName}>{ticket.event.name}</Text>
        <Text style={styles.eventDate}>
          {new Date(ticket.event.startsAt).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
          })}
        </Text>
        <Text style={styles.location}>📍 {ticket.event.neighbourhood}</Text>

        <View style={styles.divider} />

        {/* QR Code */}
        <View style={styles.qrContainer}>
          {ticket.scannedAt ? (
            <View style={styles.usedBadge}>
              <Text style={styles.usedText}>✓ Ticket Used</Text>
              <Text style={styles.usedDate}>
                Scanned {new Date(ticket.scannedAt).toLocaleString()}
              </Text>
            </View>
          ) : (
            <>
              <QRCode value={ticket.qrCode} size={220} backgroundColor="#18181b" color="#ffffff" />
              <Text style={styles.qrHint}>Show this at the door</Text>
            </>
          )}
        </View>

        <View style={styles.divider} />

        {/* Ticket meta */}
        <View style={styles.metaRow}>
          <View>
            <Text style={styles.metaLabel}>Price Paid</Text>
            <Text style={styles.metaValue}>${ticket.pricePaid.toFixed(2)}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Ticket ID</Text>
            <Text style={[styles.metaValue, styles.mono]}>{ticket.qrCode.slice(0, 8).toUpperCase()}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  content: { paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#0d0d0f', alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#a1a1aa', fontSize: 15 },
  cover: { width: '100%', height: 200 },
  card: { margin: 16, backgroundColor: '#18181b', borderRadius: 16, borderWidth: 1, borderColor: '#3f3f46', padding: 20 },
  eventName: { color: '#fafafa', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  eventDate: { color: '#a1a1aa', fontSize: 14, marginBottom: 4 },
  location: { color: '#a1a1aa', fontSize: 14 },
  divider: { height: 1, backgroundColor: '#3f3f46', marginVertical: 20 },
  qrContainer: { alignItems: 'center', gap: 12 },
  qrHint: { color: '#71717a', fontSize: 13, marginTop: 8 },
  usedBadge: { alignItems: 'center', paddingVertical: 20 },
  usedText: { color: '#4ade80', fontSize: 20, fontWeight: '700' },
  usedDate: { color: '#71717a', fontSize: 12, marginTop: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { color: '#71717a', fontSize: 11, marginBottom: 4 },
  metaValue: { color: '#fafafa', fontSize: 15, fontWeight: '600' },
  mono: { fontFamily: 'monospace', letterSpacing: 1 },
})
