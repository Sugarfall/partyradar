'use client'

import { useState, useCallback } from 'react'
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import Link from 'next/link'
import type { DemoVenue } from '@/hooks/useEvents'

const MAPBOX_TOKEN = process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] ?? ''

const TYPE_COLORS: Record<string, string> = {
  NIGHTCLUB:    '#00e5ff',
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

interface Props {
  venues: DemoVenue[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function VenuesMiniMap({ venues, selectedId, onSelect }: Props) {
  const [popupVenue, setPopupVenue] = useState<DemoVenue | null>(null)

  const handleMarkerClick = useCallback((venue: DemoVenue) => {
    setPopupVenue(venue)
    onSelect(venue.id)
  }, [onSelect])

  return (
    <Map
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{
        longitude: -4.2518,
        latitude: 55.8642,
        zoom: 12.5,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      attributionControl={false}
    >
      <NavigationControl position="top-right" showCompass={false} />

      {venues.map((venue) => {
        const color = TYPE_COLORS[venue.type] ?? '#00e5ff'
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
                width: isSelected ? 18 : 13,
                height: isSelected ? 18 : 13,
                borderRadius: '50%',
                background: color,
                border: `2px solid ${isSelected ? '#fff' : color}`,
                boxShadow: `0 0 ${isSelected ? 14 : 8}px ${color}${isSelected ? 'cc' : '80'}`,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                zIndex: isSelected ? 10 : 1,
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
              border: `1px solid ${TYPE_COLORS[popupVenue.type] ?? '#00e5ff'}50`,
              borderRadius: 10,
              padding: '10px 12px',
              minWidth: 160,
              boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
            }}
          >
            <p style={{ color: '#e0f2fe', fontWeight: 800, fontSize: 12, letterSpacing: '0.04em', marginBottom: 2 }}>
              {popupVenue.name}
            </p>
            <p style={{ color: TYPE_COLORS[popupVenue.type] ?? '#00e5ff', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 6 }}>
              {TYPE_LABELS[popupVenue.type]}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <Link
                href={`/venues/${popupVenue.id}`}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '5px 8px',
                  borderRadius: 6,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  color: TYPE_COLORS[popupVenue.type] ?? '#00e5ff',
                  border: `1px solid ${TYPE_COLORS[popupVenue.type] ?? '#00e5ff'}50`,
                  background: `${TYPE_COLORS[popupVenue.type] ?? '#00e5ff'}12`,
                  textDecoration: 'none',
                  display: 'block',
                }}
              >
                VIEW →
              </Link>
            </div>
          </div>
        </Popup>
      )}
    </Map>
  )
}
