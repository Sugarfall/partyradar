import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Switch,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../_layout'
import { api } from '@/lib/api'
import type { CreateEventInput, EventType, AlcoholPolicy, AgeRestriction } from '@partyradar/shared'
import { VIBE_TAGS, EVENT_TYPE_COLORS } from '@partyradar/shared'

const STEPS = ['Basic Info', 'Location', 'Tickets', 'Details', 'Privacy', 'Review']

const defaultForm: Partial<CreateEventInput> = {
  type: 'HOME_PARTY',
  alcoholPolicy: 'NONE',
  ageRestriction: 'ALL_AGES',
  isInviteOnly: false,
  showNeighbourhoodOnly: false,
  whatToBring: [],
  vibeTags: [],
  price: 0,
  ticketQuantity: 0,
  capacity: 50,
}

export default function CreateEventScreen() {
  const router = useRouter()
  const { dbUser } = useAuth()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Partial<CreateEventInput>>(defaultForm)
  const [loading, setLoading] = useState(false)

  if (!dbUser) {
    return (
      <View style={styles.center}>
        <Text style={styles.gateText}>Sign in to host events</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/auth')}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function update(patch: Partial<CreateEventInput>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const event = await api.post<{ data: { id: string } }>('/events', form)
      Alert.alert('Event Published! 🎉', 'Your event is now live.', [
        { text: 'View Event', onPress: () => router.replace(`/events/${event.data.id}`) },
      ])
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressSegment,
              i <= step ? styles.progressActive : styles.progressInactive,
              i < STEPS.length - 1 && { marginRight: 3 },
            ]}
          />
        ))}
      </View>

      <Text style={styles.stepLabel}>{STEPS[step]}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Step 1: Basic Info */}
        {step === 0 && (
          <View style={styles.section}>
            <Field label="Event Name *">
              <TextInput
                style={styles.input}
                value={form.name ?? ''}
                onChangeText={(v) => update({ name: v })}
                placeholder="My Rooftop Party"
                placeholderTextColor="#52525b"
                maxLength={100}
              />
            </Field>

            <Field label="Event Type *">
              <View style={styles.typeRow}>
                {(['HOME_PARTY', 'CLUB_NIGHT', 'CONCERT'] as EventType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typePill,
                      form.type === t && { borderColor: EVENT_TYPE_COLORS[t], backgroundColor: EVENT_TYPE_COLORS[t] + '22' },
                    ]}
                    onPress={() => update({ type: t })}
                  >
                    <Text style={[styles.typePillText, form.type === t && { color: EVENT_TYPE_COLORS[t] }]}>
                      {t === 'HOME_PARTY' ? '🏠 Home' : t === 'CLUB_NIGHT' ? '🎵 Club' : '🎤 Concert'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Start Date & Time *">
              <TextInput
                style={styles.input}
                value={form.startsAt ? new Date(form.startsAt).toLocaleString() : ''}
                onChangeText={(v) => {
                  const d = new Date(v)
                  if (!isNaN(d.getTime())) update({ startsAt: d.toISOString() })
                }}
                placeholder="e.g. 2025-07-20 22:00"
                placeholderTextColor="#52525b"
              />
            </Field>

            <Field label="Description *">
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.description ?? ''}
                onChangeText={(v) => update({ description: v })}
                placeholder="Tell people what to expect..."
                placeholderTextColor="#52525b"
                multiline
                numberOfLines={4}
                maxLength={2000}
              />
            </Field>
          </View>
        )}

        {/* Step 2: Location */}
        {step === 1 && (
          <View style={styles.section}>
            <Field label="Full Address *">
              <TextInput
                style={styles.input}
                value={form.address ?? ''}
                onChangeText={(v) => update({ address: v })}
                placeholder="123 Main St, New York, NY"
                placeholderTextColor="#52525b"
              />
            </Field>
            <Field label="Neighbourhood *">
              <TextInput
                style={styles.input}
                value={form.neighbourhood ?? ''}
                onChangeText={(v) => update({ neighbourhood: v })}
                placeholder="Lower East Side"
                placeholderTextColor="#52525b"
              />
            </Field>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Field label="Latitude *">
                  <TextInput
                    style={styles.input}
                    value={form.lat !== undefined ? String(form.lat) : ''}
                    onChangeText={(v) => update({ lat: Number(v) })}
                    placeholder="40.7128"
                    placeholderTextColor="#52525b"
                    keyboardType="decimal-pad"
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Longitude *">
                  <TextInput
                    style={styles.input}
                    value={form.lng !== undefined ? String(form.lng) : ''}
                    onChangeText={(v) => update({ lng: Number(v) })}
                    placeholder="-74.0060"
                    placeholderTextColor="#52525b"
                    keyboardType="decimal-pad"
                  />
                </Field>
              </View>
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Privacy Mode</Text>
                <Text style={styles.switchHint}>Show neighbourhood only, not full address</Text>
              </View>
              <Switch
                value={form.showNeighbourhoodOnly ?? false}
                onValueChange={(v) => update({ showNeighbourhoodOnly: v })}
                trackColor={{ false: '#3f3f46', true: '#a855f7' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        {/* Step 3: Capacity & Tickets */}
        {step === 2 && (
          <View style={styles.section}>
            <Field label="Max Guests *">
              <TextInput
                style={styles.input}
                value={String(form.capacity ?? 50)}
                onChangeText={(v) => update({ capacity: Number(v) })}
                keyboardType="number-pad"
              />
            </Field>
            <Field label="Ticket Price (USD, 0 = Free)">
              <TextInput
                style={styles.input}
                value={String(form.price ?? 0)}
                onChangeText={(v) => update({ price: Number(v) })}
                keyboardType="decimal-pad"
              />
            </Field>
            {(form.price ?? 0) > 0 && (
              <Field label="Ticket Quantity">
                <TextInput
                  style={styles.input}
                  value={String(form.ticketQuantity ?? 0)}
                  onChangeText={(v) => update({ ticketQuantity: Number(v) })}
                  keyboardType="number-pad"
                />
              </Field>
            )}
            {(form.price ?? 0) > 0 && (
              <Text style={styles.hint}>Platform fee: 5% per ticket. Requires Pro or Premium plan.</Text>
            )}
          </View>
        )}

        {/* Step 4: Details */}
        {step === 3 && (
          <View style={styles.section}>
            <Field label="Alcohol Policy">
              <View style={styles.optionGroup}>
                {(['NONE', 'PROVIDED', 'BYOB'] as AlcoholPolicy[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.optionPill, form.alcoholPolicy === p && styles.optionActive]}
                    onPress={() => update({ alcoholPolicy: p })}
                  >
                    <Text style={[styles.optionText, form.alcoholPolicy === p && styles.optionActiveText]}>
                      {p === 'NONE' ? 'No Alcohol' : p === 'PROVIDED' ? 'Provided' : 'BYOB'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Age Restriction">
              <View style={styles.optionGroup}>
                {(['ALL_AGES', 'AGE_18', 'AGE_21'] as AgeRestriction[]).map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={[styles.optionPill, form.ageRestriction === a && styles.optionActive]}
                    onPress={() => update({ ageRestriction: a })}
                  >
                    <Text style={[styles.optionText, form.ageRestriction === a && styles.optionActiveText]}>
                      {a === 'ALL_AGES' ? 'All Ages' : a === 'AGE_18' ? '18+' : '21+'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Dress Code">
              <TextInput
                style={styles.input}
                value={form.dressCode ?? ''}
                onChangeText={(v) => update({ dressCode: v || undefined })}
                placeholder="Smart casual, all black..."
                placeholderTextColor="#52525b"
              />
            </Field>

            <Field label="House Rules">
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.houseRules ?? ''}
                onChangeText={(v) => update({ houseRules: v || undefined })}
                placeholder="No smoking indoors, music off by 2am..."
                placeholderTextColor="#52525b"
                multiline
                numberOfLines={3}
              />
            </Field>

            <Field label="Vibe Tags">
              <View style={styles.tagWrap}>
                {VIBE_TAGS.map((tag) => {
                  const active = (form.vibeTags ?? []).includes(tag)
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.tagPill, active && styles.tagPillActive]}
                      onPress={() => {
                        const cur = form.vibeTags ?? []
                        update({ vibeTags: active ? cur.filter((t) => t !== tag) : [...cur, tag] })
                      }}
                    >
                      <Text style={[styles.tagText, active && styles.tagTextActive]}>#{tag}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </Field>
          </View>
        )}

        {/* Step 5: Privacy */}
        {step === 4 && (
          <View style={styles.section}>
            <View style={[styles.switchRow, styles.card]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Invite Only</Text>
                <Text style={styles.switchHint}>
                  Hidden from public discovery. Only accessible via your invite link.
                </Text>
              </View>
              <Switch
                value={form.isInviteOnly ?? false}
                onValueChange={(v) => update({ isInviteOnly: v })}
                trackColor={{ false: '#3f3f46', true: '#a855f7' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        {/* Step 6: Review */}
        {step === 5 && (
          <View style={styles.section}>
            <Text style={styles.reviewTitle}>{form.name ?? '(no name)'}</Text>
            <Text style={styles.reviewDesc} numberOfLines={3}>{form.description}</Text>

            <View style={styles.reviewGrid}>
              <ReviewItem label="Type" value={(form.type ?? '').replace('_', ' ')} />
              <ReviewItem label="Price" value={form.price === 0 ? 'Free' : `$${form.price}`} />
              <ReviewItem label="Capacity" value={`${form.capacity} guests`} />
              <ReviewItem label="Alcohol" value={form.alcoholPolicy ?? 'NONE'} />
              <ReviewItem label="Location" value={form.neighbourhood ?? '?'} />
              <ReviewItem label="Age" value={form.ageRestriction?.replace('_', ' ') ?? 'All Ages'} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnSecondary, step === 0 && { opacity: 0.4 }]}
          onPress={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <Text style={styles.navBtnSecondaryText}>← Back</Text>
        </TouchableOpacity>

        {step < STEPS.length - 1 ? (
          <TouchableOpacity style={styles.navBtn} onPress={() => setStep((s) => s + 1)}>
            <Text style={styles.navBtnText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.navBtn, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.navBtnText}>Publish 🎉</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
    </View>
  )
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={reviewStyles.item}>
      <Text style={reviewStyles.label}>{label}</Text>
      <Text style={reviewStyles.value}>{value}</Text>
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  label: { color: '#a1a1aa', fontSize: 12, fontWeight: '600', marginBottom: 6 },
})

const reviewStyles = StyleSheet.create({
  item: { backgroundColor: '#27272a', borderRadius: 10, padding: 10, marginBottom: 8 },
  label: { color: '#71717a', fontSize: 11 },
  value: { color: '#fafafa', fontSize: 14, fontWeight: '600', marginTop: 2 },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  center: { flex: 1, backgroundColor: '#0d0d0f', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  gateText: { color: '#a1a1aa', fontSize: 16, textAlign: 'center' },
  btn: { backgroundColor: '#a855f7', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  progressBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  progressSegment: { flex: 1, height: 3, borderRadius: 2 },
  progressActive: { backgroundColor: '#a855f7' },
  progressInactive: { backgroundColor: '#3f3f46' },
  stepLabel: { color: '#71717a', fontSize: 11, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  section: { paddingHorizontal: 16 },

  input: {
    backgroundColor: '#27272a', color: '#fafafa', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    borderWidth: 1, borderColor: '#3f3f46',
  },
  multiline: { height: 96, textAlignVertical: 'top' },

  row: { flexDirection: 'row' },

  typeRow: { flexDirection: 'row', gap: 8 },
  typePill: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#3f3f46', alignItems: 'center',
  },
  typePillText: { color: '#71717a', fontSize: 12, fontWeight: '600' },

  optionGroup: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  optionPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#3f3f46',
  },
  optionActive: { borderColor: '#a855f7', backgroundColor: '#a855f722' },
  optionText: { color: '#71717a', fontSize: 13, fontWeight: '500' },
  optionActiveText: { color: '#a855f7' },

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: '#3f3f46',
  },
  tagPillActive: { borderColor: '#a855f7', backgroundColor: '#a855f722' },
  tagText: { color: '#71717a', fontSize: 12 },
  tagTextActive: { color: '#a855f7' },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  card: {
    backgroundColor: '#18181b', borderRadius: 12,
    borderWidth: 1, borderColor: '#3f3f46', padding: 16,
  },
  switchLabel: { color: '#fafafa', fontSize: 15, fontWeight: '600' },
  switchHint: { color: '#71717a', fontSize: 12, marginTop: 2 },

  hint: { color: '#71717a', fontSize: 12, marginTop: -8, marginBottom: 16 },

  reviewTitle: { color: '#fafafa', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  reviewDesc: { color: '#a1a1aa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  reviewGrid: { gap: 0 },

  navBar: {
    flexDirection: 'row', gap: 12, padding: 16,
    borderTopWidth: 1, borderTopColor: '#27272a',
    backgroundColor: '#0d0d0f',
  },
  navBtn: {
    flex: 1, backgroundColor: '#a855f7', paddingVertical: 14,
    borderRadius: 12, alignItems: 'center',
  },
  navBtnSecondary: {
    backgroundColor: '#27272a', borderWidth: 1, borderColor: '#3f3f46',
  },
  navBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  navBtnSecondaryText: { color: '#a1a1aa', fontSize: 15, fontWeight: '600' },
})
