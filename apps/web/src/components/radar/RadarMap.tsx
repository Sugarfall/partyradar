'use client'

import { useEffect, useRef } from 'react'

type Sighting = {
  id: string
  celebrity: string
  lat: number
  lng: number
  upvotes: number
  downvotes: number
  expiresAt: string
}

export default function RadarMap({ sightings }: { sightings: Sighting[] }) {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<any[]>([])
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

  useEffect(() => {
    if (!token || typeof window === 'undefined') return
    let mapboxgl: any
    try { mapboxgl = require('mapbox-gl') } catch { return }
    if (!mapboxgl) return

    mapboxgl.accessToken = token

    if (!mapRef.current && containerRef.current) {
      // Start with a world view, then fly to user location once GPS resolves
      mapRef.current = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [0, 20],
        zoom: 2,
        attributionControl: false,
      })

      // Fly to user's actual GPS position
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (mapRef.current) {
              mapRef.current.flyTo({
                center: [pos.coords.longitude, pos.coords.latitude],
                zoom: 12,
                duration: 1500,
              })
            }
          },
          () => {/* permission denied — keep world view */},
          { timeout: 5000 },
        )
      }
    }

    // Remove old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const map = mapRef.current
    if (!map) return

    sightings.forEach((s) => {
      const el = document.createElement('div')
      el.style.cssText = `
        width:36px;height:36px;border-radius:50%;
        background:rgba(255,214,0,0.15);border:2px solid #ffd600;
        box-shadow:0 0 16px rgba(255,214,0,0.5);
        display:flex;align-items:center;justify-content:center;
        font-size:16px;cursor:pointer;
      `
      el.textContent = '⭐'

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
        .setHTML(`<div style="background:#07071a;border:1px solid rgba(255,214,0,0.3);border-radius:10px;padding:10px 12px;min-width:160px;"><p style="color:#ffd600;font-weight:900;font-size:13px;margin:0 0 3px">${s.celebrity}</p><p style="color:rgba(255,214,0,0.5);font-size:10px;margin:0">👍 ${s.upvotes} &nbsp; 👎 ${s.downvotes}</p></div>`)

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([s.lng, s.lat])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    })

    if (sightings.length > 0) {
      const lngs = sightings.map((s) => s.lng)
      const lats = sightings.map((s) => s.lat)
      map.fitBounds(
        [[Math.min(...lngs) - 0.02, Math.min(...lats) - 0.02], [Math.max(...lngs) + 0.02, Math.max(...lats) + 0.02]],
        { padding: 40, maxZoom: 14, duration: 1000 }
      )
    }
  }, [sightings, token])

  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.remove())
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  if (!token) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3"
        style={{ background: 'radial-gradient(ellipse at center, rgba(255,214,0,0.05) 0%, #04040d 70%)' }}>
        <div className="text-4xl" style={{ filter: 'drop-shadow(0 0 12px rgba(255,214,0,0.5))' }}>⭐</div>
        <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(255,214,0,0.5)' }}>
          {sightings.length} SIGHTINGS ACTIVE
        </p>
        <p className="text-[9px]" style={{ color: 'rgba(74,96,128,0.5)' }}>Add NEXT_PUBLIC_MAPBOX_TOKEN to enable map</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full" style={{ position: 'relative' }}>
      <div className="absolute bottom-0 inset-x-0 h-8 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to top, rgba(4,4,13,0.7), transparent)' }} />
    </div>
  )
}
