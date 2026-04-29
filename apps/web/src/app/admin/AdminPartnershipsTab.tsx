'use client'

/**
 * AdminPartnershipsTab — manage VenuePartnership records and DrinkMenuItems.
 *
 * Rendered inside the Admin page when tab === 'partnerships'.
 * Entirely self-contained: has its own data-loading and action handlers.
 *
 * Layout:
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │ Header: count + "Create Partnership" button                      │
 *  ├──────────────────────────────────────────────────────────────────┤
 *  │ Create form (collapsed by default)                               │
 *  │   • Venue ID or search-by-name input                             │
 *  │   • Commission %, contact email/phone, agreement URL             │
 *  ├──────────────────────────────────────────────────────────────────┤
 *  │ Partnership rows (sorted newest first)                           │
 *  │   • Venue name, city, type badge                                 │
 *  │   • Commission %, active badge, menu item count                  │
 *  │   • Expand → inline edit + full menu management                  │
 *  └──────────────────────────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import {
  Building2, Plus, X, ChevronDown, Loader2, Trash2,
  Edit2, Check, Search, UtensilsCrossed,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PartnershipVenue {
  id: string
  name: string
  address: string
  city: string
  photoUrl: string | null
  type: string
  claimedById: string | null
}

interface Partnership {
  id: string
  venueId: string
  commissionRate: number
  isActive: boolean
  contactEmail: string | null
  contactPhone: string | null
  agreementUrl: string | null
  totalRevenue: number
  totalOrders: number
  createdAt: string
  updatedAt: string
  venue: PartnershipVenue
  _count: { drinkMenuItems: number }
}

interface DrinkMenuItem {
  id: string
  partnershipId: string
  name: string
  description: string | null
  price: number
  category: string
  imageUrl: string | null
  isAvailable: boolean
  createdAt: string
}

interface VenueSearchResult {
  id: string
  name: string
  city: string
  address: string
  type: string
  isClaimed: boolean
  photoUrl: string | null
}

// ─── Inline field ─────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-[10px] font-bold tracking-[0.12em] block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl text-xs text-white placeholder-white/20 outline-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
      />
    </div>
  )
}

// ─── Menu management panel ────────────────────────────────────────────────────

function MenuPanel({ venueId, showToast }: { venueId: string; showToast: (msg: string, ok?: boolean) => void }) {
  const [items, setItems] = useState<DrinkMenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', price: '', category: 'drink', imageUrl: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<DrinkMenuItem>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ data: DrinkMenuItem[] }>(`/partnerships/venue/${venueId}/menu`)
      setItems(r.data)
    } catch { setItems([]) } finally { setLoading(false) }
  }, [venueId])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    if (!form.name.trim() || !form.price) return
    setSaving(true)
    try {
      await api.post(`/partnerships/venue/${venueId}/menu`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        category: form.category,
        imageUrl: form.imageUrl.trim() || null,
      })
      setForm({ name: '', description: '', price: '', category: 'drink', imageUrl: '' })
      setShowForm(false)
      load()
      showToast('Item added')
    } catch (e: any) { showToast(e?.message ?? 'Failed', false) } finally { setSaving(false) }
  }

  async function handleSaveEdit(id: string) {
    setSaving(true)
    try {
      await api.put(`/partnerships/venue/${venueId}/menu/${id}`, editData)
      setEditingId(null); setEditData({})
      load(); showToast('Item updated')
    } catch (e: any) { showToast(e?.message ?? 'Failed', false) } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this menu item?')) return
    setDeletingId(id)
    try {
      await api.delete(`/partnerships/venue/${venueId}/menu/${id}`)
      setItems((p) => p.filter((i) => i.id !== id))
      showToast('Item deleted')
    } catch (e: any) { showToast(e?.message ?? 'Failed', false) } finally { setDeletingId(null) }
  }

  const CATEGORIES = ['drink', 'food', 'combo', 'other']

  if (loading) return <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-white/30" /></div>

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
          MENU · {items.length} ITEM{items.length !== 1 ? 'S' : ''}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold"
          style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          {showForm ? <X size={10} /> : <Plus size={10} />}
          {showForm ? 'Cancel' : 'Add Item'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)' }}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="NAME *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. House Lager" />
            <div>
              <label className="text-[10px] font-bold tracking-[0.12em] block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>CATEGORY</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {CATEGORIES.map((c) => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
              </select>
            </div>
            <Field label="PRICE (£) *" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} type="number" placeholder="4.50" />
            <Field label="IMAGE URL" value={form.imageUrl} onChange={(v) => setForm((f) => ({ ...f, imageUrl: v }))} placeholder="https://..." />
            <div className="col-span-2">
              <Field label="DESCRIPTION" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Optional short description" />
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !form.name.trim() || !form.price}
            className="w-full py-2 rounded-xl text-xs font-bold disabled:opacity-40"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
          >
            {saving ? 'Adding…' : 'Add Item'}
          </button>
        </div>
      )}

      {/* Item list */}
      {items.length === 0 ? (
        <p className="text-center text-xs py-3" style={{ color: 'rgba(255,255,255,0.2)' }}>No menu items yet</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {editingId === item.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="NAME" value={editData.name ?? item.name} onChange={(v) => setEditData((d) => ({ ...d, name: v }))} />
                    <div>
                      <label className="text-[10px] font-bold tracking-[0.12em] block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>CATEGORY</label>
                      <select
                        value={editData.category ?? item.category}
                        onChange={(e) => setEditData((d) => ({ ...d, category: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {CATEGORIES.map((c) => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
                      </select>
                    </div>
                    <Field label="PRICE (£)" value={String(editData.price ?? item.price)} onChange={(v) => setEditData((d) => ({ ...d, price: Number(v) }))} type="number" />
                    <div>
                      <label className="text-[10px] font-bold tracking-[0.12em] block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>AVAILABLE</label>
                      <select
                        value={String(editData.isAvailable ?? item.isAvailable)}
                        onChange={(e) => setEditData((d) => ({ ...d, isAvailable: e.target.value === 'true' }))}
                        className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        <option value="true" className="bg-gray-900">Yes</option>
                        <option value="false" className="bg-gray-900">No (hidden)</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <Field label="DESCRIPTION" value={editData.description ?? item.description ?? ''} onChange={(v) => setEditData((d) => ({ ...d, description: v }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(item.id)} disabled={saving}
                      className="flex-1 py-1.5 rounded-xl text-[10px] font-bold disabled:opacity-40"
                      style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingId(null); setEditData({}) }}
                      className="px-4 py-1.5 rounded-xl text-[10px] font-bold"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{item.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full capitalize"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>{item.category}</span>
                      {!item.isAvailable && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>hidden</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold" style={{ color: '#10b981' }}>£{item.price.toFixed(2)}</span>
                      {item.description && (
                        <span className="text-[10px] text-white/30 truncate">{item.description}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setEditingId(item.id); setEditData({}) }}
                      className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
                      <Edit2 size={11} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id}
                      className="p-1.5 rounded-lg disabled:opacity-40"
                      style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                      {deletingId === item.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Partnership row ──────────────────────────────────────────────────────────

function PartnershipRow({
  partnership,
  onUpdated,
  onDeleted,
  showToast,
}: {
  partnership: Partnership
  onUpdated: (p: Partnership) => void
  onDeleted: (id: string) => void
  showToast: (msg: string, ok?: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<{
    commissionRate: string; isActive: string;
    contactEmail: string; contactPhone: string; agreementUrl: string;
  }>({
    commissionRate: String(partnership.commissionRate),
    isActive: String(partnership.isActive),
    contactEmail: partnership.contactEmail ?? '',
    contactPhone: partnership.contactPhone ?? '',
    agreementUrl: partnership.agreementUrl ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await api.put(`/partnerships/venue/${partnership.venueId}`, {
        commissionRate: Number(editData.commissionRate),
        isActive: editData.isActive === 'true',
        contactEmail: editData.contactEmail.trim() || null,
        contactPhone: editData.contactPhone.trim() || null,
        agreementUrl: editData.agreementUrl.trim() || null,
      })
      onUpdated({
        ...partnership,
        commissionRate: Number(editData.commissionRate),
        isActive: editData.isActive === 'true',
        contactEmail: editData.contactEmail.trim() || null,
        contactPhone: editData.contactPhone.trim() || null,
        agreementUrl: editData.agreementUrl.trim() || null,
      })
      setEditing(false)
      showToast('Partnership updated')
    } catch (e: any) { showToast(e?.message ?? 'Failed', false) } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirm(`Remove partnership with ${partnership.venue.name}? This will delete the menu too.`)) return
    setDeleting(true)
    try {
      await api.delete(`/partnerships/venue/${partnership.venueId}`)
      onDeleted(partnership.id)
      showToast('Partnership deleted')
    } catch (e: any) { showToast(e?.message ?? 'Failed', false) } finally { setDeleting(false) }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: partnership.isActive ? 'rgba(16,185,129,0.03)' : 'rgba(255,255,255,0.02)',
        border: partnership.isActive ? '1px solid rgba(16,185,129,0.12)' : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Summary row */}
      <div className="p-4 flex items-center gap-3">
        {partnership.venue.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={partnership.venue.photoUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(16,185,129,0.1)' }}>
            <Building2 size={16} style={{ color: '#10b981' }} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white">{partnership.venue.name}</span>
            {partnership.isActive ? (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                ACTIVE
              </span>
            ) : (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
                INACTIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-white/40">{partnership.venue.city}</span>
            <span className="text-xs text-white/30 capitalize">{partnership.venue.type.replace(/_/g, ' ')}</span>
            <span className="text-xs font-bold" style={{ color: '#10b981' }}>{partnership.commissionRate}% commission</span>
            <span className="text-xs text-white/25">
              {partnership._count.drinkMenuItems} menu item{partnership._count.drinkMenuItems !== 1 ? 's' : ''}
            </span>
            {partnership.totalOrders > 0 && (
              <span className="text-xs text-white/25">
                {partnership.totalOrders} orders · £{partnership.totalRevenue.toFixed(2)} revenue
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
            style={expanded
              ? { background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }
              : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            <UtensilsCrossed size={11} />
            Manage
            <ChevronDown size={10} className="transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="p-1.5 rounded-xl disabled:opacity-40"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

          {/* Edit partnership settings */}
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>PARTNERSHIP SETTINGS</p>
              {!editing ? (
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                  <Edit2 size={10} /> Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold disabled:opacity-40"
                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                    <Check size={10} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold"
                    style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {editing ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold tracking-[0.12em] block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>COMMISSION %</label>
                  <input type="number" min="0" max="100" step="0.5"
                    value={editData.commissionRate}
                    onChange={(e) => setEditData((d) => ({ ...d, commissionRate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-[0.12em] block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>STATUS</label>
                  <select value={editData.isActive}
                    onChange={(e) => setEditData((d) => ({ ...d, isActive: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <option value="true" className="bg-gray-900">Active</option>
                    <option value="false" className="bg-gray-900">Inactive</option>
                  </select>
                </div>
                <Field label="CONTACT EMAIL" value={editData.contactEmail} onChange={(v) => setEditData((d) => ({ ...d, contactEmail: v }))} type="email" placeholder="manager@venue.com" />
                <Field label="CONTACT PHONE" value={editData.contactPhone} onChange={(v) => setEditData((d) => ({ ...d, contactPhone: v }))} placeholder="+44 7700 900000" />
                <div className="col-span-2">
                  <Field label="AGREEMENT URL" value={editData.agreementUrl} onChange={(v) => setEditData((d) => ({ ...d, agreementUrl: v }))} placeholder="https://docs.google.com/..." />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {[
                  ['Commission', `${partnership.commissionRate}%`],
                  ['Status', partnership.isActive ? 'Active' : 'Inactive'],
                  ['Contact email', partnership.contactEmail ?? '—'],
                  ['Contact phone', partnership.contactPhone ?? '—'],
                  ['Agreement', partnership.agreementUrl ? (
                    <a href={partnership.agreementUrl} target="_blank" rel="noreferrer"
                      className="underline" style={{ color: '#10b981' }}>View</a>
                  ) : '—'],
                  ['Created', new Date(partnership.createdAt).toLocaleDateString()],
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} className="flex items-center gap-2">
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>{lbl}:</span>
                    <span className="font-medium text-white/70">{val as React.ReactNode}</span>
                  </div>
                ))}
                {partnership.venue.claimedById && (
                  <div className="col-span-2 flex items-center gap-2">
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>Venue owner:</span>
                    <span className="font-mono text-[10px] text-white/40">{partnership.venue.claimedById.slice(0, 12)}…</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Menu management */}
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <MenuPanel venueId={partnership.venueId} showToast={showToast} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Create Partnership form ──────────────────────────────────────────────────

function CreatePartnershipForm({
  onCreated,
  showToast,
}: {
  onCreated: (p: Partnership) => void
  showToast: (msg: string, ok?: boolean) => void
}) {
  const [venueQ, setVenueQ] = useState('')
  const [venueCity, setVenueCity] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<VenueSearchResult[] | null>(null)
  const [selectedVenue, setSelectedVenue] = useState<VenueSearchResult | null>(null)
  const [commissionRate, setCommissionRate] = useState('3')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [agreementUrl, setAgreementUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleSearch() {
    if (!venueQ.trim()) return
    setSearching(true)
    setSearchResults(null)
    setSelectedVenue(null)
    try {
      const params = new URLSearchParams({ q: venueQ.trim() })
      if (venueCity.trim()) params.set('city', venueCity.trim())
      const r = await api.get<{ data: { venues: VenueSearchResult[] } }>(`/venues/discover/search?${params}`)
      setSearchResults(r.data.venues)
    } catch (e: any) { showToast(e?.message ?? 'Search failed', false) }
    finally { setSearching(false) }
  }

  async function handleCreate() {
    if (!selectedVenue) return
    setSaving(true)
    try {
      const r = await api.post<{ data: Partnership }>(`/partnerships/venue/${selectedVenue.id}`, {
        commissionRate: Number(commissionRate),
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        agreementUrl: agreementUrl.trim() || null,
      })
      onCreated(r.data)
      showToast(`Partnership created for ${selectedVenue.name}`)
      setSelectedVenue(null)
      setSearchResults(null)
      setVenueQ('')
      setVenueCity('')
      setCommissionRate('3')
      setContactEmail('')
      setContactPhone('')
      setAgreementUrl('')
    } catch (e: any) { showToast(e?.message ?? 'Failed', false) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3 rounded-2xl p-4" style={{ background: 'rgba(16,185,129,0.03)', border: '1px solid rgba(16,185,129,0.12)' }}>
      <p className="text-[10px] font-black tracking-widest" style={{ color: '#10b981' }}>CREATE PARTNERSHIP</p>

      {/* Venue search */}
      <div className="flex gap-2">
        <input
          value={venueQ}
          onChange={(e) => setVenueQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="Venue name (e.g. The Garage)"
          className="flex-1 px-3 py-2 rounded-xl text-xs text-white placeholder-white/20 outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        />
        <input
          value={venueCity}
          onChange={(e) => setVenueCity(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="City"
          className="w-24 px-3 py-2 rounded-xl text-xs text-white placeholder-white/20 outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        />
        <button
          onClick={handleSearch}
          disabled={searching || !venueQ.trim()}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
          style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          Search
        </button>
      </div>

      {/* Search results */}
      {searchResults !== null && (
        searchResults.length === 0 ? (
          <p className="text-xs text-center text-white/30 py-2">No venues found</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {searchResults.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVenue(v)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all"
                style={selectedVenue?.id === v.id
                  ? { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }
                  : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }
                }
              >
                {v.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.photoUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <Building2 size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{v.name}</p>
                  <p className="text-[10px] text-white/40 truncate">{v.address}</p>
                </div>
                {v.isClaimed && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>CLAIMED</span>
                )}
              </button>
            ))}
          </div>
        )
      )}

      {/* Partnership settings (shown after venue selected) */}
      {selectedVenue && (
        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid rgba(16,185,129,0.15)' }}>
          <p className="text-[10px] text-white/50">
            Creating partnership for <span className="text-white font-bold">{selectedVenue.name}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="COMMISSION %" value={commissionRate} onChange={setCommissionRate} type="number" placeholder="3" />
            <Field label="CONTACT EMAIL" value={contactEmail} onChange={setContactEmail} type="email" placeholder="manager@venue.com" />
            <Field label="CONTACT PHONE" value={contactPhone} onChange={setContactPhone} placeholder="+44 7700 900000" />
            <Field label="AGREEMENT URL" value={agreementUrl} onChange={setAgreementUrl} placeholder="https://..." />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-xs font-black disabled:opacity-40"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
          >
            {saving ? 'Creating…' : `Create Partnership with ${selectedVenue.name}`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main exported tab ────────────────────────────────────────────────────────

export default function AdminPartnershipsTab({
  showToast,
}: {
  showToast: (msg: string, ok?: boolean) => void
}) {
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ data: Partnership[] }>('/partnerships')
      setPartnerships(r.data)
    } catch { setPartnerships([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function handleCreated(p: Partnership) {
    setPartnerships((prev) => [p, ...prev])
    setShowCreate(false)
  }

  function handleUpdated(p: Partnership) {
    setPartnerships((prev) => prev.map((x) => (x.id === p.id ? p : x)))
  }

  function handleDeleted(id: string) {
    setPartnerships((prev) => prev.filter((x) => x.id !== id))
  }

  const active = partnerships.filter((p) => p.isActive).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-white/40">
            {loading ? '…' : `${partnerships.length} partnerships · ${active} active`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
          style={showCreate
            ? { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }
            : { background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
          }
        >
          {showCreate ? <><X size={12} /> Cancel</> : <><Plus size={12} /> New Partnership</>}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreatePartnershipForm onCreated={handleCreated} showToast={showToast} />
      )}

      {/* Partnerships list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin" style={{ color: 'rgba(16,185,129,0.4)' }} />
        </div>
      ) : partnerships.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <UtensilsCrossed size={28} className="mx-auto" style={{ color: 'rgba(255,255,255,0.1)' }} />
          <p className="text-sm text-white/30">No venue partnerships yet</p>
          <p className="text-xs text-white/20">Click &quot;New Partnership&quot; to onboard the first venue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {partnerships.map((p) => (
            <PartnershipRow
              key={p.id}
              partnership={p}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              showToast={showToast}
            />
          ))}
        </div>
      )}
    </div>
  )
}
