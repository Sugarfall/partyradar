'use client'

/**
 * AdminVenueClaimsTab — review and approve/reject pending venue claim requests.
 *
 * A claim is "pending" when claimedById is set but isClaimed is still false.
 * Admin approves → isClaimed flips to true; reject → claimedById cleared.
 */

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { Building2, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'

interface PendingClaim {
  id: string
  name: string
  address: string
  city: string
  type: string
  photoUrl: string | null
  isClaimed: boolean
  claimedById: string
  claimedBy: {
    id: string
    username: string
    displayName: string
    email: string
    photoUrl: string | null
  } | null
}

export default function AdminVenueClaimsTab({
  showToast,
}: {
  showToast: (msg: string, ok?: boolean) => void
}) {
  const [claims, setClaims] = useState<PendingClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ data: PendingClaim[] }>('/venues/admin/pending-claims')
      setClaims(r.data)
    } catch {
      setClaims([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleApprove(venueId: string, venueName: string) {
    setBusy(venueId)
    try {
      await api.post(`/venues/${venueId}/claim/approve`, {})
      setClaims((prev) => prev.filter((c) => c.id !== venueId))
      showToast(`Claim approved for ${venueName}`)
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to approve', false)
    } finally {
      setBusy(null)
    }
  }

  async function handleReject(venueId: string, venueName: string) {
    if (!confirm(`Reject the claim request for "${venueName}"? The applicant will need to re-apply.`)) return
    setBusy(venueId + '_reject')
    try {
      await api.post(`/venues/${venueId}/claim/reject`, {})
      setClaims((prev) => prev.filter((c) => c.id !== venueId))
      showToast(`Claim rejected for ${venueName}`)
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to reject', false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-white/40">
          {loading ? '…' : `${claims.length} pending claim${claims.length !== 1 ? 's' : ''}`}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      ) : claims.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <CheckCircle size={28} className="mx-auto" style={{ color: 'rgba(16,185,129,0.3)' }} />
          <p className="text-sm text-white/30">No pending venue claims</p>
          <p className="text-xs text-white/20">All clear — nothing to review</p>
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map((claim) => (
            <div
              key={claim.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              <div className="p-4 flex items-start gap-3">
                {/* Venue photo or icon */}
                {claim.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={claim.photoUrl}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(245,158,11,0.1)' }}
                  >
                    <Building2 size={20} style={{ color: '#f59e0b' }} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  {/* Venue info */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">{claim.name}</span>
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
                    >
                      PENDING
                    </span>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{claim.address}{claim.city ? `, ${claim.city}` : ''}</p>
                  <p className="text-[10px] text-white/25 capitalize mt-0.5">{claim.type.replace(/_/g, ' ')}</p>

                  {/* Claimant info */}
                  {claim.claimedBy && (
                    <div
                      className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      {claim.claimedBy.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={claim.claimedBy.photoUrl}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                          style={{ background: 'rgba(255,255,255,0.1)' }}
                        >
                          {claim.claimedBy.displayName[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{claim.claimedBy.displayName}</p>
                        <p className="text-[10px] text-white/35 truncate">@{claim.claimedBy.username} · {claim.claimedBy.email}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div
                className="px-4 pb-4 flex gap-2"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="pt-3 flex gap-2 w-full">
                  <button
                    onClick={() => handleApprove(claim.id, claim.name)}
                    disabled={busy === claim.id || busy === claim.id + '_reject'}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
                  >
                    {busy === claim.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <CheckCircle size={12} />
                    )}
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(claim.id, claim.name)}
                    disabled={busy === claim.id || busy === claim.id + '_reject'}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    {busy === claim.id + '_reject' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <XCircle size={12} />
                    )}
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
