'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl'
import type { MapRef } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import Link from 'next/link'

const MAPBOX_TOKEN = process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] ?? ''

const TYPE_COLORS: Record<string, string> = {
  NIGHTCLUB:    'var(--accent)',
  BAR:          '#a855f7',
  PUB:          '#22c55e',
  CONCERT_HALL: '#3d5afe',
  ROOFTOP_BAR:  '#f59e0b',
  LOUNGE:       '#ec4899',
}

const TYPE_LABELS: Record<string, string> = {
  NIGHTCLUB:    'NIGHTCLUB',
  BAR:          'BAR',
  PUB:          'PUB',
  CONCERT_HALL: 'CONCERT HALL',
  ROOFTOP_BAR:  'ROOFTOP',
  LOUNGE:       'LOUNGE',
}

// Accept any venue shape that has the fields the map needs
export interface MapVenue {
  id: string
  name: string
  lat: number
  lng: number
  type: string
  vibeTags?: string[]
  rating?: number | null
}

interface Props {
  venues: MapVenue[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** When set, the map flies to this position (e.g. after city search or location update) */
  flyToCenter?: { lat: number; lng: number } | null
}

export default function VenuesMiniMap({ venues, selectedId, onSelect, flyToCenter }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [popupVenue, setPopupVenue] = useState<MapVenue | null>(null)

  const handleMarkerClick = useCallback((venue: MapVenue) => {
    setPopupVenue(venue)
    onSelect(venue.id)
  }, [onSelect])

  // Fly to new center when requested (city search or first real location)
  useEffect(() => {
    if (!flyToCenter || !mapRef.current) return
    mapRef.current.flyTo({
      center: [flyToCenter.lng, flyToCenter.lat],
      zoom: 13,
      duration: 1200,
    })
  }, [flyToCenter?.lat, flyToCenter?.lng])

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{
        longitude: -4.2518,
        latitude: 55.8642,
        zoom: 12,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      attributionControl={false}
    >
      <NavigationControl position="top-right" showCompass={false} />

      {venues.map((venue) => {
        const color = TYPE_COLORS[venue.type] ?? 'var(--accent)'
        const isSelected = venue.id === selectedId

        return (
          <Marker
            key={venue.id}
            longitude={venue.lng}
            latitude={venue.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              handleMarkerClick(venue)
            }}
          >
            <div
              style={{
                width: isSelected ? 18 : 12,
                height: isSelected ? 18 : 12,
                borderRadius: '50%',
                background: color,
                border: `2px solid ${isSelected ? '#fff' : 'rgba(4,4,13,0.6)'}`,
                boxShadow: `0 0 ${isSelected ? 14 : 6}px ${color}${isSelected ? 'cc' : '80'}`,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            />
          </Marker>
        )
      })}

      {popupVenue && (
        <Popup
          longitude={popupVenue.lng}
          latitude={popupVenue.lat}
          anchor="bottom"
          offset={14}
          onClose={() => {
            setPopupVenue(null)
            onSelect(popupVenue.id)
          }}
          closeButton={false}
          style={{ zIndex: 20 }}
        >
          <div
            style={{
              background: 'rgba(7,7,26,0.97)',
              border: `1px solid ${TYPE_COLORS[popupVenue.type] ?? 'var(--accent)'}50`,
              borderRadius: 10,
              padding: '10px 12px',
              minWidth: 160,
              boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
            }}
          >
            <p style={{ color: '#e0f2fe', fontWeight: 800, fontSize: 12, letterSpacing: '0.04em', marginBottom: 2 }}>
              {popupVenue.name}
            </p>
            <p style={{ color: TYPE_COLORS[popupVenue.type] ?? 'var(--accent)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 6 }}>
              {TYPE_LABELS[popupVenue.type] ?? popupVenue.type}
            </p>
            <Link
              href={`/venues/${popupVenue.id}`}
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '5px 8px',
                borderRadius: 6,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.1em',
                color: TYPE_COLORS[popupVenue.type] ?? 'var(--accent)',
                border: `1px solid ${TYPE_COLORS[popupVenue.type] ?? 'var(--accent)'}50`,
                background: `${TYPE_COLORS[popupVenue.type] ?? 'var(--accent)'}12`,
                textDecoration: 'none',
              }}
            >
              VIEW →
            </Link>
          </div>
        </Popup>
      )}
    </Map>
  )
}
