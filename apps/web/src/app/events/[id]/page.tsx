'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, MapPin, Users, Wine, ShieldCheck, Shirt,
  QrCode, ArrowLeft, Star, Share2, Lock, Loader2, Check,
  ChevronRight, Zap, Link2, ChevronDown, ChevronUp, UserCircle2,
  Megaphone, Radio, Eye, EyeOff, XCircle, AlertTriangle, MessageCircle
} from 'lucide-react'
import { useEvent, updateEvent, cancelEvent } from '@/hooks/useEvents'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { DEV_MODE } from '@/lib/firebase'
import EventChat from '@/components/EventChat'
import InterestMatch from '@/components/InterestMatch'
import { ALCOHOL_POLICY_LABELS, AGE_RESTRICTION_LABELS, PUSH_BLAST_TIERS } from '@partyradar/shared'
import type { PushBlastTier } from '@partyradar/shared'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import type { EventGuest } from '@partyradar/shared'

const TYPE_CONFIG: Record<string, { color: string; glow: string; label: string }> = {
  HOME_PARTY: { color: '#ff006e', glow: 'rgba(255,0,110,0.25)', label: 'HOME PARTY' },
  CLUB_NIGHT:  { color: '#00e5ff', glow: 'rgba(0,229,255,0.25)',  label: 'CLUB NIGHT'  },
  CONCERT:     { color: '#3d5afe', glow: 'rgba(61,90,254,0.25)',  label: 'CONCERT'     },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function MetaCell({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="p-4 rounded-xl flex flex-col gap-2" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.1)' }}>
      <div className="flex items-center gap-1.5">
        <Icon size={11} style={{ color: 'rgba(0,229,255,0.4)' }} />
        <span className="text-[9px] font-bold tracking-[0.18em]" style={{ color: 'rgba(0,229,255,0.45)' }}>{label}</span>
      </div>
      <p className="text-sm font-bold leading-tight" style={{ color: '#e0f2fe' }}>{value}</p>
    </div>
  )
}

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { dbUser } = useAuth()
  const { event, isLoading, error, mutate } = useEvent(params['id'] as string)

  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [ticketLoading, setTicketLoading] = useState(false)
  const [rsvpDone, setRsvpDone] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [guestListOpen, setGuestListOpen] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [blastOpen, setBlastOpen] = useState(false)
  const [blastTier, setBlastTier] = useState<PushBlastTier>(PUSH_BLAST_TIERS[0]!)
  const [blastMessage, setBlastMessage] = useState('')
  const [blastLoading, setBlastLoading] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)

  const isHostView = !!dbUser && event?.hostId === dbUser.id

  const { data: guestData } = useSWR<{ data: EventGuest[] }>(
    isHostView && guestListOpen ? `/events/${params['id']}/guests` : null,
    fetcher
  )

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
        <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.5)' }}>LOADING EVENT...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm font-bold tracking-widest" style={{ color: 'rgba(255,0,110,0.7)' }}>EVENT NOT FOUND</p>
        <Link href="/discover" className="btn-primary text-xs px-4 py-2" style={{ letterSpacing: '0.1em' }}>
          ← BACK TO DISCOVER
        </Link>
      </div>
    )
  }

  const tc = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.CLUB_NIGHT
  const isHost = dbUser?.id === event.hostId
  const isFree = event.price === 0
  const capacityPct = Math.round(((event.guestCount ?? 0) / event.capacity) * 100)
  const isFull = capacityPct >= 100

  async function handleRSVP() {
    if (!dbUser) { router.push('/login'); return }
    setRsvpLoading(true)
    setActionError(null)
    try {
      await api.post(`/events/${event!.id}/guests/rsvp`)
      await mutate()
      setRsvpDone(true)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'RSVP failed')
    } finally {
      setRsvpLoading(false)
    }
  }

  async function handleTicketCheckout() {
    if (!dbUser) { router.push('/login'); return }
    setTicketLoading(true)
    try {
      const res = await api.post<{ data: { url: string } }>('/tickets/checkout', { eventId: event!.id, quantity: 1 })
      window.location.href = res.data.url
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Checkout failed')
      setTicketLoading(false)
    }
  }

  async function handleInviteLink() {
    setInviteLoading(true)
    try {
      const res = await api.post<{ data: { inviteToken: string } }>(`/events/${event!.id}/guests/invite/link`, {})
      const link = `${window.location.origin}/events/invite/${res.data.inviteToken}`
      await navigator.clipboard.writeText(link)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2500)
    } catch {
      // Fallback: copy current URL
      await navigator.clipboard.writeText(window.location.href)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2500)
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleCancel() {
    if (!cancelConfirm) { setCancelConfirm(true); return }
    setCancelLoading(true)
    try {
      await cancelEvent(event!.id)
      if (!DEV_MODE) await mutate()
      else router.push('/host')
      setCancelConfirm(false)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Cancel failed')
    } finally {
      setCancelLoading(false)
    }
  }

  async function handleTogglePublish() {
    setPublishLoading(true)
    try {
      await updateEvent(event!.id, { isPublished: !event!.isPublished } as any)
      if (!DEV_MODE) await mutate()
      else router.refresh()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPublishLoading(false)
    }
  }

  async function handleBlast() {
    if (!blastMessage.trim()) return
    setBlastLoading(true)
    try {
      const res = await api.post<{ data: { url: string } }>('/notifications/blast', {
        eventId: event!.id,
        tierId: blastTier.id,
        message: blastMessage.trim(),
      })
      window.location.href = res.data.url
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Blast failed')
      setBlastLoading(false)
    }
  }

  async function handleShare() {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: event!.name, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {}
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: '#04040d' }}>
      {/* ── Hero image ── */}
      <div className="relative" style={{ height: 280 }}>
        {event.coverImageUrl ? (
          <img src={event.coverImageUrl} alt={event.name} className="w-full h-full object-cover"
            style={{ filter: 'brightness(0.5) saturate(1.2)' }} />
        ) : (
          <div className="w-full h-full"
            style={{ background: `radial-gradient(ellipse at 30% 50%, ${tc.color}20 0%, #04040d 70%)` }} />
        )}
        {/* Gradient fade to background */}
        <div className="absolute inset-0"
          style={{ background: `linear-gradient(to bottom, rgba(4,4,13,0.2) 0%, rgba(4,4,13,0.6) 60%, #04040d 100%)` }} />

        {/* Neon color overlay at top edge */}
        <div className="absolute top-0 inset-x-0 h-1"
          style={{ background: `linear-gradient(90deg, transparent, ${tc.color}, transparent)`, boxShadow: `0 0 20px ${tc.color}` }} />

        {/* Back button */}
        <Link href="/discover"
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200"
          style={{ background: 'rgba(4,4,13,0.7)', border: '1px solid rgba(0,229,255,0.2)', color: 'rgba(0,229,255,0.7)', backdropFilter: 'blur(8px)' }}>
          <ArrowLeft size={12} /> DISCOVER
        </Link>

        {/* Share button */}
        <button onClick={handleShare}
          className="absolute top-4 right-4 p-2 rounded-lg transition-all duration-200 flex items-center gap-1.5"
          style={{ background: 'rgba(4,4,13,0.7)', border: '1px solid rgba(0,229,255,0.2)', backdropFilter: 'blur(8px)' }}>
          {copied
            ? <><Check size={13} style={{ color: '#00ff88' }} /><span className="text-[10px] font-bold" style={{ color: '#00ff88' }}>COPIED</span></>
            : <Share2 size={14} style={{ color: 'rgba(0,229,255,0.6)' }} />
          }
        </button>

        {/* Type badge + featured overlay */}
        <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap">
          <span className="text-[9px] font-bold px-2.5 py-1 rounded"
            style={{ color: tc.color, border: `1px solid ${tc.color}50`, background: `${tc.color}15`, letterSpacing: '0.15em', boxShadow: `0 0 10px ${tc.glow}` }}>
            {tc.label}
          </span>
          {event.isFeatured && (
            <span className="text-[9px] font-bold px-2.5 py-1 rounded"
              style={{ color: '#ffd600', border: '1px solid rgba(255,214,0,0.4)', background: 'rgba(255,214,0,0.1)', letterSpacing: '0.12em' }}>
              ★ FEATURED
            </span>
          )}
          {event.isInviteOnly && (
            <span className="text-[9px] font-bold px-2 py-1 rounded flex items-center gap-1"
              style={{ color: 'rgba(224,242,254,0.5)', border: '1px solid rgba(224,242,254,0.15)', background: 'rgba(4,4,13,0.6)' }}>
              <Lock size={9} /> INVITE ONLY
            </span>
          )}
          {event.isCancelled && (
            <span className="text-[9px] font-bold px-2.5 py-1 rounded"
              style={{ color: '#ff006e', border: '1px solid rgba(255,0,110,0.4)', background: 'rgba(255,0,110,0.1)', letterSpacing: '0.12em' }}>
              CANCELLED
            </span>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto px-4 -mt-2">
        {/* Title */}
        <h1 className="text-2xl font-black leading-tight mb-4" style={{ color: '#e0f2fe' }}>{event.name}</h1>

        {/* Host row */}
        <div className="flex items-center gap-3 mb-6 p-3 rounded-xl"
          style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
          {event.host.photoUrl ? (
            <img src={event.host.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover"
              style={{ border: `1px solid ${tc.color}40`, boxShadow: `0 0 8px ${tc.glow}` }} />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-base"
              style={{ background: `${tc.color}15`, border: `1px solid ${tc.color}40`, color: tc.color }}>
              {event.host.displayName[0]}
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{event.host.displayName}</p>
            {event.hostRating && (
              <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: '#ffd600' }}>
                <Star size={10} fill="currentColor" /> {event.hostRating.toFixed(1)} host rating
              </p>
            )}
          </div>
          {/* Price */}
          <div className="text-right">
            <p className="text-xl font-black"
              style={{ color: isFree ? '#00ff88' : '#e0f2fe', textShadow: isFree ? '0 0 12px rgba(0,255,136,0.6)' : 'none' }}>
              {isFree ? 'FREE' : `£${event.price.toFixed(2)}`}
            </p>
            {!isFree && <p className="text-[10px] font-bold" style={{ color: 'rgba(74,96,128,0.6)' }}>PER TICKET</p>}
          </div>
        </div>

        {/* Divider */}
        <div className="mb-5 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tc.color}30, transparent)` }} />

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <MetaCell icon={Calendar} label="DATE & TIME" value={formatDate(event.startsAt)} color={tc.color} />
          <MetaCell icon={MapPin} label="LOCATION" value={event.showNeighbourhoodOnly ? event.neighbourhood : (event.address ?? event.neighbourhood)} color={tc.color} />
          <MetaCell icon={Wine} label="ALCOHOL" value={ALCOHOL_POLICY_LABELS[event.alcoholPolicy] ?? event.alcoholPolicy} color={tc.color} />
          <MetaCell icon={ShieldCheck} label="AGE POLICY" value={AGE_RESTRICTION_LABELS[event.ageRestriction] ?? event.ageRestriction} color={tc.color} />
        </div>

        {/* Capacity bar */}
        <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.1)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Users size={11} style={{ color: 'rgba(0,229,255,0.4)' }} />
              <span className="text-[9px] font-bold tracking-[0.18em]" style={{ color: 'rgba(0,229,255,0.45)' }}>CAPACITY</span>
            </div>
            <span className="text-xs font-black" style={{ color: isFull ? '#ff006e' : '#e0f2fe' }}>
              {event.guestCount ?? 0} / {event.capacity}
              {isFull && <span className="ml-2 text-[9px] tracking-widest" style={{ color: '#ff006e' }}>FULL</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(0,229,255,0.08)' }}>
            <div
              className="h-1.5 rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, capacityPct)}%`,
                background: capacityPct > 80 ? '#ff006e' : capacityPct > 50 ? '#ffd600' : tc.color,
                boxShadow: `0 0 8px ${capacityPct > 80 ? 'rgba(255,0,110,0.5)' : `${tc.color}`}`,
              }}
            />
          </div>
        </div>

        {/* Gender ratio */}
        {event.genderRatio && event.genderRatio.total > 0 && (() => {
          const { male, female, nonBinary, total } = event.genderRatio!
          const malePct  = Math.round((male      / total) * 100)
          const femPct   = Math.round((female    / total) * 100)
          const nbPct    = Math.max(0, 100 - malePct - femPct)
          return (
            <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.1)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold tracking-[0.18em]" style={{ color: 'rgba(0,229,255,0.45)' }}>CROWD MIX</span>
                </div>
                <span className="text-[10px] font-bold" style={{ color: 'rgba(224,242,254,0.4)' }}>{total} attending</span>
              </div>
              {/* Ratio bar */}
              <div className="flex h-2 rounded-full overflow-hidden gap-px mb-3">
                {malePct > 0 && (
                  <div style={{ width: `${malePct}%`, background: '#3b82f6', boxShadow: '0 0 6px rgba(59,130,246,0.5)', transition: 'width 0.7s' }} />
                )}
                {femPct > 0 && (
                  <div style={{ width: `${femPct}%`, background: '#ec4899', boxShadow: '0 0 6px rgba(236,72,153,0.5)', transition: 'width 0.7s' }} />
                )}
                {nbPct > 0 && (
                  <div style={{ width: `${nbPct}%`, background: '#00e5ff', boxShadow: '0 0 6px rgba(0,229,255,0.4)', transition: 'width 0.7s' }} />
                )}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#3b82f6', boxShadow: '0 0 4px rgba(59,130,246,0.6)' }} />
                  <span className="text-[10px] font-bold" style={{ color: 'rgba(59,130,246,0.8)' }}>♂ {malePct}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#ec4899', boxShadow: '0 0 4px rgba(236,72,153,0.6)' }} />
                  <span className="text-[10px] font-bold" style={{ color: 'rgba(236,72,153,0.8)' }}>♀ {femPct}%</span>
                </div>
                {nbPct > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: '#00e5ff', boxShadow: '0 0 4px rgba(0,229,255,0.5)' }} />
                    <span className="text-[10px] font-bold" style={{ color: 'rgba(0,229,255,0.7)' }}>⚧ {nbPct}%</span>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* About */}
        <div className="mb-6">
          <p className="text-[9px] font-bold tracking-[0.2em] mb-2" style={{ color: 'rgba(0,229,255,0.45)' }}>ABOUT THIS EVENT</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(224,242,254,0.7)' }}>{event.description}</p>
        </div>

        {/* Dress code */}
        {event.dressCode && (
          <div className="flex gap-3 mb-4 p-3 rounded-xl"
            style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
            <Shirt size={14} style={{ color: 'rgba(0,229,255,0.4)' }} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-[9px] font-bold tracking-[0.15em] mb-0.5" style={{ color: 'rgba(0,229,255,0.45)' }}>DRESS CODE</p>
              <p className="text-sm" style={{ color: '#e0f2fe' }}>{event.dressCode}</p>
            </div>
          </div>
        )}

        {/* House rules */}
        {event.houseRules && (
          <div className="mb-6 p-4 rounded-xl"
            style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.15)' }}>
            <p className="text-[9px] font-bold tracking-[0.15em] mb-2" style={{ color: 'rgba(255,214,0,0.6)' }}>HOUSE RULES</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(224,242,254,0.7)' }}>{event.houseRules}</p>
          </div>
        )}

        {/* Party signals — HOME_PARTY only, visible to all on detail page */}
        {event.type === 'HOME_PARTY' && (event as any).partySigns?.length > 0 && (
          <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(255,0,110,0.03)', border: '1px solid rgba(255,0,110,0.12)' }}>
            <p className="text-[9px] font-bold tracking-[0.2em] mb-3" style={{ color: 'rgba(255,0,110,0.5)' }}>WHAT'S HAPPENING</p>
            <div className="flex gap-3 flex-wrap">
              {(event as any).partySigns.map((code: string) => {
                const SIGNALS: Record<string, string> = { BAR:'🍾', GAMING:'🎮', GAMES:'🎲', FLOOR:'🕺', FIRE:'🔥', KARAOKE:'🎤', FOOD:'🍕', COSTUME:'🎭', LATENIGHT:'🌙', HOTTUB:'♨️', LIVE:'🎸', PONG:'🎯', POOL:'🏊', CHILL:'🌿', FLIRTY:'💋', SNACKS:'🍩' }
                return SIGNALS[code] ? (
                  <span key={code} className="text-2xl" title={code} style={{ filter: 'drop-shadow(0 0 6px rgba(255,0,110,0.4))' }}>
                    {SIGNALS[code]}
                  </span>
                ) : null
              })}
            </div>
          </div>
        )}

        {/* Lineup — club/concert */}
        {(event as any).lineup && (
          <div className="flex gap-3 mb-5 p-3 rounded-xl" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
            <div>
              <p className="text-[9px] font-bold tracking-[0.15em] mb-0.5" style={{ color: 'rgba(0,229,255,0.45)' }}>LINEUP</p>
              <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{(event as any).lineup}</p>
            </div>
          </div>
        )}

        {/* Vibe tags */}
        {event.vibeTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {event.vibeTags.map((tag: string) => (
              <span key={tag} className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: `${tc.color}80`, border: `1px solid ${tc.color}20`, background: `${tc.color}06`, letterSpacing: '0.08em' }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Host controls */}
        {isHost && (
          <div className="mt-2 space-y-3">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Link href={`/events/${event.id}/scan`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200"
                style={{ border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff', letterSpacing: '0.1em' }}>
                <QrCode size={13} /> SCAN TICKETS
              </Link>
              <Link href={`/events/${event.id}/edit`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200"
                style={{ border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.6)', letterSpacing: '0.1em' }}>
                EDIT EVENT
              </Link>
              <button
                onClick={handleInviteLink}
                disabled={inviteLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-50"
                style={{ border: `1px solid ${inviteCopied ? 'rgba(0,255,136,0.4)' : 'rgba(0,229,255,0.15)'}`, color: inviteCopied ? '#00ff88' : 'rgba(0,229,255,0.6)', letterSpacing: '0.1em' }}>
                {inviteLoading
                  ? <Loader2 size={12} className="animate-spin" />
                  : inviteCopied
                  ? <><Check size={12} /> LINK COPIED</>
                  : <><Link2 size={12} /> INVITE LINK</>
                }
              </button>
              {/* Live chat — host */}
              <EventChat eventId={event.id} eventName={event.name} />
              {/* Publish / Unpublish */}
              {!event.isCancelled && (
                <button
                  onClick={handleTogglePublish}
                  disabled={publishLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-50"
                  style={{
                    border: `1px solid ${event.isPublished ? 'rgba(255,214,0,0.3)' : 'rgba(0,255,136,0.3)'}`,
                    color: event.isPublished ? 'rgba(255,214,0,0.8)' : '#00ff88',
                    letterSpacing: '0.1em',
                  }}>
                  {publishLoading
                    ? <Loader2 size={12} className="animate-spin" />
                    : event.isPublished
                    ? <><EyeOff size={12} /> UNPUBLISH</>
                    : <><Eye size={12} /> PUBLISH</>
                  }
                </button>
              )}
              {/* Cancel event */}
              {!event.isCancelled && (
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-50"
                  style={{
                    border: `1px solid ${cancelConfirm ? 'rgba(255,0,110,0.6)' : 'rgba(255,0,110,0.2)'}`,
                    color: cancelConfirm ? '#ff006e' : 'rgba(255,0,110,0.5)',
                    background: cancelConfirm ? 'rgba(255,0,110,0.08)' : 'transparent',
                    letterSpacing: '0.1em',
                  }}>
                  {cancelLoading
                    ? <Loader2 size={12} className="animate-spin" />
                    : cancelConfirm
                    ? <><AlertTriangle size={12} /> CONFIRM CANCEL</>
                    : <><XCircle size={12} /> CANCEL EVENT</>
                  }
                </button>
              )}
            </div>

            {/* Push blast panel */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,0,110,0.2)' }}>
              <button
                onClick={() => setBlastOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 transition-all"
                style={{ background: 'rgba(255,0,110,0.04)' }}>
                <div className="flex items-center gap-2">
                  <Megaphone size={12} style={{ color: 'rgba(255,0,110,0.6)' }} />
                  <span className="text-xs font-black tracking-widest" style={{ color: '#e0f2fe' }}>SEND BLAST</span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,0,110,0.12)', color: '#ff006e', border: '1px solid rgba(255,0,110,0.25)' }}>
                    PAID
                  </span>
                </div>
                {blastOpen
                  ? <ChevronUp size={14} style={{ color: 'rgba(255,0,110,0.4)' }} />
                  : <ChevronDown size={14} style={{ color: 'rgba(255,0,110,0.4)' }} />
                }
              </button>

              {blastOpen && (
                <div className="p-4 space-y-4" style={{ borderTop: '1px solid rgba(255,0,110,0.1)' }}>
                  {/* Tier selector */}
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.18em] mb-2" style={{ color: 'rgba(255,0,110,0.5)' }}>
                      BLAST RADIUS
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {PUSH_BLAST_TIERS.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setBlastTier(t)}
                          className="p-3 rounded-xl text-left transition-all"
                          style={{
                            background: blastTier.id === t.id ? 'rgba(255,0,110,0.12)' : 'rgba(4,4,13,0.6)',
                            border: `1px solid ${blastTier.id === t.id ? 'rgba(255,0,110,0.5)' : 'rgba(255,0,110,0.1)'}`,
                            boxShadow: blastTier.id === t.id ? '0 0 12px rgba(255,0,110,0.15)' : 'none',
                          }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black" style={{ color: blastTier.id === t.id ? '#ff006e' : 'rgba(224,242,254,0.6)' }}>
                              {t.label}
                            </span>
                            <span className="text-[11px] font-black" style={{ color: blastTier.id === t.id ? '#ff006e' : 'rgba(224,242,254,0.5)' }}>
                              £{t.price.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-[9px]" style={{ color: 'rgba(74,96,128,0.7)' }}>{t.reach}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message input */}
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.18em] mb-2" style={{ color: 'rgba(255,0,110,0.5)' }}>
                      NOTIFICATION MESSAGE
                    </p>
                    <textarea
                      value={blastMessage}
                      onChange={(e) => setBlastMessage(e.target.value.slice(0, 120))}
                      placeholder="e.g. Party just started — doors open now, limited spots left! 🎉"
                      rows={3}
                      className="w-full resize-none rounded-xl px-3 py-2.5 text-xs outline-none transition-all"
                      style={{
                        background: 'rgba(4,4,13,0.8)',
                        border: '1px solid rgba(255,0,110,0.2)',
                        color: '#e0f2fe',
                        caretColor: '#ff006e',
                      }}
                    />
                    <p className="text-right text-[9px] mt-1" style={{ color: 'rgba(74,96,128,0.5)' }}>
                      {blastMessage.length}/120
                    </p>
                  </div>

                  {/* Estimated reach */}
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(255,0,110,0.04)', border: '1px solid rgba(255,0,110,0.1)' }}>
                    <Radio size={11} style={{ color: 'rgba(255,0,110,0.5)' }} />
                    <span className="text-[10px] font-bold" style={{ color: 'rgba(224,242,254,0.5)' }}>ESTIMATED REACH</span>
                    <span className="ml-auto text-[11px] font-black" style={{ color: '#ff006e' }}>{blastTier.reach}</span>
                  </div>

                  {/* Pay & blast CTA */}
                  <button
                    onClick={handleBlast}
                    disabled={blastLoading || !blastMessage.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-xs transition-all duration-200 disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,0,110,0.2), rgba(255,0,110,0.1))',
                      border: '1px solid rgba(255,0,110,0.45)',
                      color: '#ff006e',
                      boxShadow: '0 0 20px rgba(255,0,110,0.2)',
                      letterSpacing: '0.1em',
                    }}>
                    {blastLoading
                      ? <><Loader2 size={13} className="animate-spin" /> REDIRECTING TO PAYMENT...</>
                      : <><Megaphone size={13} /> PAY £{blastTier.price.toFixed(2)} &amp; BLAST →</>
                    }
                  </button>
                </div>
              )}
            </div>

            {/* Guest list toggle */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,229,255,0.12)' }}>
              <button
                onClick={() => setGuestListOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 transition-all"
                style={{ background: 'rgba(0,229,255,0.03)' }}>
                <div className="flex items-center gap-2">
                  <Users size={12} style={{ color: 'rgba(0,229,255,0.5)' }} />
                  <span className="text-xs font-black tracking-widest" style={{ color: '#e0f2fe' }}>
                    GUEST LIST
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff' }}>
                    {event.guestCount ?? 0}
                  </span>
                </div>
                {guestListOpen
                  ? <ChevronUp size={14} style={{ color: 'rgba(0,229,255,0.4)' }} />
                  : <ChevronDown size={14} style={{ color: 'rgba(0,229,255,0.4)' }} />
                }
              </button>

              {guestListOpen && (
                <div style={{ borderTop: '1px solid rgba(0,229,255,0.08)' }}>
                  {!guestData ? (
                    <div className="flex items-center justify-center py-6 gap-2">
                      <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin"
                        style={{ color: 'rgba(0,229,255,0.3)' }} />
                      <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.3)' }}>LOADING...</span>
                    </div>
                  ) : guestData.data.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>NO GUESTS YET</p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y" style={{ borderColor: 'rgba(0,229,255,0.05)' }}>
                      {guestData.data.map((guest) => (
                        <div key={guest.id} className="flex items-center gap-3 px-4 py-2.5">
                          {(guest as any).user?.photoUrl ? (
                            <img src={(guest as any).user.photoUrl} alt=""
                              className="w-7 h-7 rounded-full object-cover shrink-0"
                              style={{ border: '1px solid rgba(0,229,255,0.2)' }} />
                          ) : (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.15)' }}>
                              <UserCircle2 size={14} style={{ color: 'rgba(0,229,255,0.4)' }} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>
                              {(guest as any).user?.displayName ?? 'Unknown'}
                            </p>
                            <p className="text-[10px]" style={{ color: 'rgba(74,96,128,0.6)' }}>
                              @{(guest as any).user?.username ?? '—'}
                            </p>
                          </div>
                          <span className="text-[9px] font-black px-2 py-0.5 rounded tracking-wide"
                            style={{
                              color: guest.status === 'CONFIRMED' ? '#00ff88' : guest.status === 'CANCELLED' ? '#ff006e' : 'rgba(255,214,0,0.8)',
                              background: guest.status === 'CONFIRMED' ? 'rgba(0,255,136,0.08)' : guest.status === 'CANCELLED' ? 'rgba(255,0,110,0.08)' : 'rgba(255,214,0,0.08)',
                              border: `1px solid ${guest.status === 'CONFIRMED' ? 'rgba(0,255,136,0.2)' : guest.status === 'CANCELLED' ? 'rgba(255,0,110,0.2)' : 'rgba(255,214,0,0.2)'}`,
                            }}>
                            {guest.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed action bar (guests only) ── */}
      {!isHost && !event.isCancelled && (
        <div
          className="z-30 px-4 py-4"
          style={{
            position: 'fixed',
            bottom: 64,
            left: 0,
            right: 0,
            background: 'rgba(4,4,13,0.96)',
            borderTop: '1px solid rgba(0,229,255,0.1)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="max-w-2xl mx-auto">
            {/* Who's going count */}
            {!rsvpDone && (event.guestCount ?? 0) > 0 && (
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Users size={12} style={{ color: 'rgba(0,229,255,0.5)' }} />
                <span className="text-[11px] font-bold" style={{ color: 'rgba(0,229,255,0.55)' }}>
                  {event.guestCount ?? 0} {(event.guestCount ?? 0) === 1 ? 'person' : 'people'} going
                </span>
              </div>
            )}
            {!rsvpDone && !(event.guestCount ?? 0) && (
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Users size={12} style={{ color: 'rgba(0,229,255,0.35)' }} />
                <span className="text-[11px] font-bold" style={{ color: 'rgba(74,96,128,0.5)' }}>
                  Be the first to RSVP
                </span>
              </div>
            )}

            {actionError && (
              <p className="text-xs font-medium mb-2 px-3 py-2 rounded-lg"
                style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                {actionError}
              </p>
            )}

            {rsvpDone ? (
              /* Success state */
              <div className="flex items-center justify-center gap-3 py-3 rounded-xl animate-fade-up"
                style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: '#00ff88', boxShadow: '0 0 16px rgba(0,255,136,0.5)' }}>
                  <Check size={14} color="#04040d" strokeWidth={3} />
                </div>
                <div>
                  <p className="text-sm font-black" style={{ color: '#00ff88' }}>YOU'RE IN!</p>
                  <p className="text-[10px]" style={{ color: 'rgba(0,255,136,0.6)' }}>RSVP confirmed · Check your tickets</p>
                </div>
                <Link href="/profile"
                  className="ml-auto text-[10px] font-bold flex items-center gap-1 px-3 py-1.5 rounded-lg"
                  style={{ border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
                  VIEW <ChevronRight size={10} />
                </Link>
              </div>
            ) : isFull ? (
              <div className="flex items-center justify-center py-3 rounded-xl"
                style={{ background: 'rgba(255,0,110,0.06)', border: '1px solid rgba(255,0,110,0.2)' }}>
                <p className="text-sm font-black tracking-widest" style={{ color: '#ff006e' }}>EVENT IS FULL</p>
              </div>
            ) : isFree ? (
              <button
                onClick={handleRSVP}
                disabled={rsvpLoading}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm transition-all duration-200 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,229,255,0.1))',
                  border: '1px solid rgba(0,255,136,0.45)',
                  color: '#00ff88',
                  boxShadow: '0 0 24px rgba(0,255,136,0.2)',
                  letterSpacing: '0.1em',
                }}
              >
                {rsvpLoading
                  ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> CONFIRMING...</>
                  : <><Zap size={15} /> RSVP — FREE ENTRY</>
                }
              </button>
            ) : (
              <button
                onClick={handleTicketCheckout}
                disabled={ticketLoading}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm transition-all duration-200 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${tc.color}18, rgba(61,90,254,0.12))`,
                  border: `1px solid ${tc.color}50`,
                  color: tc.color,
                  boxShadow: `0 0 24px ${tc.glow}`,
                  letterSpacing: '0.1em',
                }}
              >
                {ticketLoading
                  ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> REDIRECTING...</>
                  : <><QrCode size={15} /> BUY TICKET — £{event.price.toFixed(2)}</>
                }
              </button>
            )}

            {/* Live chat — guest action bar */}
            <div className="mt-2 flex justify-center">
              <EventChat eventId={event.id} eventName={event.name} />
            </div>
          </div>
        </div>
      )}

      {/* Interest match toast (auto-shows in DEV_MODE after 10s) */}
      <InterestMatch eventId={event.id} />
    </div>
  )
}
