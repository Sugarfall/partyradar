'use client'

import { useState, useCallback, useRef } from 'react'
import Map, { Marker, Popup, NavigationControl, GeolocateControl } from 'react-map-gl'
import type { Event } from '@partyradar/shared'
import { EVENT_TYPE_COLORS } from '@partyradar/shared'
import { EventCard } from './EventCard'
import 'mapbox-gl/dist/mapbox-gl.css'

interface EventMapProps {
  events: Event[]
  onBoundsChange?: (bounds: { lat: number; lng: number; radius: number }) => void
}

export function EventMap({ events, onBoundsChange }: EventMapProps) {
  const [selected, setSelected] = useState<Event | null>(null)
  const [viewport, setViewport] = useState({
    longitude: -74.006,
    latitude: 40.7128,
    zoom: 12,
  })

  const handleMapMove = useCallback((evt: { viewState: typeof viewport }) => {
    setViewport(evt.viewState)
    if (onBoundsChange) {
      // Approximate radius from zoom level
      const radius = 40075 / (2 ** (evt.viewState.zoom + 1)) * 0.621371
      onBoundsChange({
        lat: evt.viewState.latitude,
        lng: evt.viewState.longitude,
        radius: Math.max(1, Math.min(radius, 100)),
      })
    }
  }, [onBoundsChange])

  return (
    <Map
      mapboxAccessToken={process.env['NEXT_PUBLIC_MAPBOX_TOKEN']}
      {...viewport}
      onMove={handleMapMove}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      attributionControl={false}
    >
      <NavigationControl position="top-right" />
      <GeolocateControl position="top-right" trackUserLocation />

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
