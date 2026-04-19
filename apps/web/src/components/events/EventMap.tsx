'use client'

import { useState, useEffect } from 'react'
import Map, { Marker, Popup, NavigationControl, GeolocateControl } from 'react-map-gl'
import type { Event } from '@partyradar/shared'
import { EVENT_TYPE_COLORS } from '@partyradar/shared'
import { EventCard } from './EventCard'
import 'mapbox-gl/dist/mapbox-gl.css'

interface EventMapProps {
  events: Event[]
  centerLat?: number
  centerLng?: number
  // Legacy prop — no longer drives filtering, kept for API compat
  onBoundsChange?: (bounds: { lat: number; lng: number; radius: number }) => void
}

export function EventMap({ events, centerLat, centerLng, onBoundsChange }: EventMapProps) {
  const [selected, setSelected] = useState<Event | null>(null)
  const [viewport, setViewport] = useState({
    longitude: centerLng ?? -4.2518,  // Default: Glasgow city centre
    latitude: centerLat ?? 55.8642,
    zoom: 12,
  })

  const mapboxToken = process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] ?? ''

  // Re-centre when parent provides a user location
  useEffect(() => {
    if (centerLat && centerLng) {
      setViewport((v) => ({ ...v, latitude: centerLat, longitude: centerLng }))
    }
  }, [centerLat, centerLng])

  if (!mapboxToken) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: '#04040d' }}>
        <p className="text-xs" style={{ color: 'rgba(74,96,128,0.5)' }}>Map unavailable</p>
      </div>
    )
  }

  return (
    <Map
      mapboxAccessToken={mapboxToken}
      {...viewport}
      onMove={(evt) => setViewport(evt.viewState)}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      attributionControl={false}
    >
      <NavigationControl position="top-right" />
      <GeolocateControl
        position="top-right"
        trackUserLocation
        onGeolocate={(e) => {
          setViewport((v) => ({
            ...v,
            latitude: e.coords.latitude,
            longitude: e.coords.longitude,
          }))
        }}
      />

      {events.map((event) => (
        <Marker
          key={event.id}
          longitude={event.lng}
          latitude={event.lat}
          anchor="center"
          onClick={(e) => { e.originalEvent.stopPropagation(); setSelected(event) }}
        >
          <div
            className="w-9 h-9 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
            style={{ backgroundColor: EVENT_TYPE_COLORS[event.type] ?? '#a855f7' }}
          >
            <span className="text-white text-xs font-bold">
              {event.type === 'HOME_PARTY' ? '🏠' : event.type === 'CLUB_NIGHT' ? '🎵' : event.type === 'PUB_NIGHT' ? '🍺' : event.type === 'BEACH_PARTY' ? '🏖️' : event.type === 'YACHT_PARTY' ? '⛵' : '🎤'}
            </span>
          </div>
        </Marker>
      ))}

      {selected && (
        <Popup
          longitude={selected.lng}
          latitude={selected.lat}
          onClose={() => setSelected(null)}
          closeButton={false}
          offset={20}
          maxWidth="280px"
        >
          <EventCard event={selected} compact />
        </Popup>
      )}
    </Map>
  )
}
