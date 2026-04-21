'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { ShieldCheck, Star, Zap, Crown } from 'lucide-react'

interface Brand {
  id: string; slug: string; name: string; description?: string | null
  logoUrl?: string | null; accentColor?: string | null
  entitlement?: { tier: string; grantedAt: string } | null
}

export default function BrandPage() {
  const { slug } = useParams<{ slug: string }>()
  const { dbUser } = useAuth()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    api.get<{ data: Brand }>(`/brands/${slug}`)
      .then(j => { if (j?.data) setBrand(j.data) })
      .finally(() => setLoading(false))
  }, [slug])

  async function apply() {
    if (!dbUser) return
    setApplying(true)
    const json = await api.post<{ data: { status: string; tier: string } }>(`/brands/${slug}/apply`, {}).catch(() => null)
    if (json?.data?.status === 'granted') {
      setApplied(true)
      setBrand(prev => prev ? { ...prev, entitlement: { tier: json.data.tier, grantedAt: new Date().toISOString() } } : prev)
    }
    setApplying(false)
  }

  const accent = brand?.accentColor || '#a855f7'
  const tierIcon = { ELITE: <Crown size={14} />, PREMIUM: <Star size={14} />, STANDARD: <Zap size={14} /> }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07071a' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(168,85,247,0.1)', borderTopColor: '#a855f7' }} />
    </div>
  )

  if (!brand) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07071a' }}>
      <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)' }}>Brand not found</p>
    </div>
  )

  const hasEntitlement = !!brand.entitlement

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      {/* Hero */}
      <div className="relative px-4 pt-16 pb-10 text-center overflow-hidden"
        style={{ background: `linear-gradient(180deg, ${accent}18 0%, transparent 100%)`, borderBottom: `1px solid ${accent}20` }}>
        <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center text-4xl"
          style={{ background: `${accent}15`, border: `2px solid ${accent}40` }}>
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="w-full h-full rounded-2xl object-cover" /> : '✦'}
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-1" style={{ color: '#e0f2fe' }}>{brand.name}</h1>
        {brand.description && <p className="text-sm max-w-sm mx-auto mt-2" style={{ color: 'rgba(224,242,254,0.5)' }}>{brand.description}</p>}

        {hasEntitlement && (
          <div className="inline-flex items-center gap-1.5 mt-4 px-4 py-1.5 rounded-full text-xs font-black"
            style={{ background: `${accent}15`, border: `1px solid ${accent}40`, color: accent }}>
            {tierIcon[brand.entitlement!.tier as keyof typeof tierIcon] ?? <Zap size={14} />}
            {brand.entitlement!.tier} ACCESS GRANTED
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Perks */}
        <div className="p-4 rounded-2xl space-y-3" style={{ background: 'rgba(7,7,26,0.8)', border: `1px solid ${accent}15` }}>
          <p className="text-[10px] font-black tracking-[0.2em]" style={{ color: `${accent}80` }}>MEMBER PERKS</p>
          {[
            'Priority entry at partner venues',
            'Exclusive event invitations',
            'VIP treatment & brand rewards',
            'Early access to drops & releases',
          ].map((perk, i) => (
            <div key={i} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(224,242,254,0.7)' }}>
              <ShieldCheck size={14} style={{ color: accent }} />
              {perk}
            </div>
          ))}
        </div>

        {/* CTA */}
        {!dbUser && (
          <Link href={`/login?next=/brands/${slug}`} className="block w-full py-3.5 rounded-xl text-center text-sm font-black tracking-widest"
            style={{ background: `${accent}15`, border: `1px solid ${accent}40`, color: accent }}>
            LOG IN TO ACCESS
          </Link>
        )}
        {dbUser && !hasEntitlement && !applied && (
          <button onClick={apply} disabled={applying}
            className="w-full py-3.5 rounded-xl text-sm font-black tracking-widest disabled:opacity-50"
            style={{ background: `${accent}15`, border: `1px solid ${accent}40`, color: accent }}>
            {applying ? 'APPLYING…' : 'APPLY FOR ACCESS'}
          </button>
        )}
        {dbUser && (hasEntitlement || applied) && (
          <div className="w-full py-3.5 rounded-xl text-center text-sm font-black tracking-widest"
            style={{ background: `${accent}08`, border: `1px solid ${accent}20`, color: `${accent}80` }}>
            ✓ ACCESS ACTIVE
          </div>
        )}
      </div>
    </div>
  )
}
