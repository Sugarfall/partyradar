'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import Map, { Marker, NavigationControl, GeolocateControl, Source, Layer } from 'react-map-gl'
import type { LayerProps } from 'react-map-gl'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { SightingCard } from './SightingCard'
import { SightingForm } from './SightingForm'
import type { CelebritySighting, CreateSightingInput } from '@partyradar/shared'
import { HOST_TIERS } from '@partyradar/shared'
import type { SubscriptionTier } from '@partyradar/shared'
import { Plus, Star, Lock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import 'mapbox-gl/dist/mapbox-gl.css'

const heatmapLayer: LayerProps = {
  id: 'sightings-heat',
  type: 'heatmap',
  paint: {
    'heatmap-weight': ['interpolate', ['linear'], ['get', 'score'], 0, 0, 10, 1],
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(245,158,11,0)',
      0.5, 'rgba(245,158,11,0.5)',
      1, 'rgba(245,158,11,1)',
    ],
    'heatmap-radius': 40,
    'heatmap-opacity': 0.7,
  },
}

export default function RadarClient() {
  const { dbUser } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [selectedSighting, setSelectedSighting] = useState<CelebritySighting | null>(null)
  const [clickedLocation, setClickedLocation] = useState<{ lat: number; lng: number } | null>(null)

  const { data, mutate } = useSWR<{ data: CelebritySighting[] }>('/radar', fetcher, {
    refreshInterval: 30000,
  })

  const sightings = data?.data ?? []

  const canUseRadar = dbUser
    ? (HOST_TIERS[dbUser.subscriptionTier as SubscriptionTier]?.radar ?? false)
    : false

  const geojson = {
    type: 'FeatureCollection' as const,
    features: sightings.map((s) => ({
      type: 'Feature' as const,
      properties: { score: s.upvotes - s.downvotes + 5 },
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
    })),
  }

  function handleMapClick(e: { lngLat: { lat: number; lng: number } }) {
    if (!canUseRadar) return
    setClickedLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    setShowForm(true)
  }

  async function handleSubmitSighting(input: CreateSightingInput) {
    await api.post('/radar', input)
    await mutate()
    setShowForm(false)
    setClickedLocation(null)
  }

  async function handleVote(sightingId: string, isUpvote: boolean) {
    await api.post(`/radar/${sightingId}/vote`, { isUpvote })
    await mutate()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-bg-primary/80 backdrop-blur-sm flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg flex items-center gap-2">
            <Star size={18} className="text-party-gold" fill="currentColor" />
            Celebrity Radar
          </h1>
          <p className="text-xs text-zinc-500">{sightings.length} active sighting{sightings.length !== 1 ? 's' : ''} · refreshes every 30s</p>
        </div>

        {canUseRadar ? (
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Plus size={14} />
            Report Sighting
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
            <Lock size={12} />
            Pro+ required
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <Map
          mapboxAccessToken={process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] ?? ''}
          initialViewState={{ longitude: -74.006, latitude: 40.7128, zoom: 11 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          onClick={handleMapClick}
          cursor={canUseRadar ? 'crosshair' : 'default'}
        >
          <NavigationControl position="top-right" />
          <GeolocateControl position="top-right" trackUserLocation />

          {/* Heatmap */}
          <Source id="sightings" type="geojson" data={geojson}>
            <Layer {...heatmapLayer} />
          </Source>

          {/* Individual markers */}
          {sightings.map((s) => {
            const remaining = new Date(s.expiresAt).getTime() - Date.now()
            const hours = Math.floor(remaining / 3600000)
            const mins = Math.floor((remaining % 3600000) / 60000)

            return (
              <Marker
                key={s.id}
                longitude={s.lng}
                latitude={s.lat}
                anchor="center"
                onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedSighting(s) }}
              >
                <div className="flex flex-col items-center cursor-pointer group">
                  <div className="w-8 h-8 rounded-full bg-party-gold border-2 border-white shadow-lg flex items-center justify-center hover:scale-110 transition-transform">
                    ⭐
                  </div>
                  <div className="mt-0.5 bg-bg-card/90 text-yellow-400 text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap border border-yellow-500/30">
                    {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
                  </div>
                </div>
              </Marker>
            )
          })}
        </Map>

        {/* Pro gate overlay */}
        {!dbUser && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="card p-6 text-center max-w-xs mx-4">
              <Star size={32} className="text-party-gold mx-auto mb-3" fill="currentColor" />
              <h3 className="font-semibold mb-1">Sign in to use Radar</h3>
              <p className="text-zinc-400 text-sm mb-4">Report celebrity sightings and see what&apos;s happening near you</p>
              <Link href="/login?next=/radar" className="btn-primary text-sm inline-block">Sign in</Link>
            </div>
          </div>
        )}
      </div>

      {/* Selected sighting panel */}
      {selectedSighting && (
        <div className="border-t border-border p-4 bg-bg-card">
          <SightingCard
            sighting={selectedSighting}
            onVote={handleVote}
            onClose={() => setSelectedSighting(null)}
          />
        </div>
      )}

      {/* Report sighting modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Report Celebrity Sighting">
        <SightingForm
          defaultLocation={clickedLocation ?? undefined}
          onSubmit={handleSubmitSighting}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  )
}
