'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Users, Plus, Share2, Check, ChevronRight, Lock, Crown, ArrowLeft, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

interface GroupMember {
  id: string; role: 'OWNER' | 'MEMBER'; joinedAt: string
  medalCount?: number; goldCount?: number; silverCount?: number; bronzeCount?: number
  user: { id: string; username: string; displayName: string; photoUrl: string | null }
}
interface CompGroup {
  id: string; name: string; description: string | null; emoji: string
  isPrivate: boolean; inviteCode: string; maxMembers: number
  members?: GroupMember[]; leaderboard?: GroupMember[]; isMember?: boolean
  _count?: { members: number }; createdAt: string
}

export default function GroupsPage() {
  const { dbUser } = useAuth()
  const [tab, setTab] = useState<'mine' | 'discover'>('mine')
  const [myGroups, setMyGroups] = useState<CompGroup[]>([])
  const [discover, setDiscover] = useState<CompGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CompGroup | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joiningCode, setJoiningCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', emoji: '🏆', isPrivate: false })
  const [creating, setCreating] = useState(false)

  const EMOJIS = ['🏆','🎯','🔥','⚡','👑','🥇','🎉','🚀','💪','🌟','🎸','🎤','🍻','🦁','🐉']

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/comp-groups') as any
      setMyGroups(res.mine ?? [])
      setDiscover(res.discover ?? [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { if (dbUser) load() }, [dbUser, load])

  async function openGroup(id: string) {
    try {
      const res = await api.get(`/comp-groups/${id}`) as any
      setSelected(res.data)
    } catch {}
  }

  async function joinPublic(id: string) {
    setJoining(id)
    try { await api.post(`/comp-groups/${id}/join`, {}); await load(); setTab('mine') }
    catch {} finally { setJoining(null) }
  }

  async function joinByCode() {
    if (!joinCode.trim()) return
    setJoiningCode(true)
    try { await api.post(`/comp-groups/join/${joinCode.trim()}`, {}); await load(); setJoinCode(''); setTab('mine') }
    catch (e: any) { alert(e?.message ?? 'Invalid code') } finally { setJoiningCode(false) }
  }

  async function leave(id: string) {
    setLeaving(true)
    try { await api.delete(`/comp-groups/${id}/leave`); setSelected(null); await load() }
    catch {} finally { setLeaving(false) }
  }

  async function create() {
    if (!form.name.trim()) return
    setCreating(true)
    try { await api.post('/comp-groups', form); setShowCreate(false); setForm({ name: '', description: '', emoji: '🏆', isPrivate: false }); await load(); setTab('mine') }
    catch {} finally { setCreating(false) }
  }

  function copyInvite(code: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    navigator.clipboard.writeText(`Join my PartyRadar group! Code: ${code}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // Group detail
  if (selected) return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4" style={{ background: 'rgba(7,7,26,0.95)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg" style={{ background: 'rgba(var(--accent-rgb),0.08)' }}>
            <ArrowLeft size={16} style={{ color: 'var(--accent)' }} />
          </button>
          <span className="text-2xl">{selected.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black truncate" style={{ color: '#e0f2fe' }}>{selected.name}</h1>
            <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>{selected._count?.members ?? selected.members?.length ?? 0} members</p>
          </div>
          <button onClick={() => copyInvite(selected.inviteCode)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)' }}>
            {copied ? <Check size={12} /> : <Share2 size={12} />} {copied ? 'Copied!' : 'Invite'}
          </button>
        </div>
        {selected.description && <p className="text-xs mt-2 ml-11" style={{ color: 'rgba(224,242,254,0.4)' }}>{selected.description}</p>}
      </div>
      <div className="px-4 py-4">
        <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.15em' }}>LEADERBOARD</p>
        <div className="space-y-2">
          {(selected.leaderboard ?? selected.members ?? []).map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: i === 0 ? 'rgba(255,215,0,0.05)' : 'rgba(7,7,26,0.8)', border: `1px solid ${i === 0 ? 'rgba(255,215,0,0.18)' : 'rgba(var(--accent-rgb),0.07)'}` }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm font-black"
                style={{ background: [0,1,2].includes(i) ? ['rgba(255,215,0,0.18)','rgba(158,160,165,0.12)','rgba(205,127,50,0.12)'][i]! : 'rgba(var(--accent-rgb),0.04)', color: [0,1,2].includes(i) ? ['#FFD700','#9EA0A5','#cd7f32'][i]! : 'rgba(224,242,254,0.25)' }}>
                {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
              </div>
              {m.user.photoUrl ? <img src={m.user.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" /> :
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-black shrink-0" style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>{m.user.displayName?.[0]?.toUpperCase()}</div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{m.user.displayName}</p>
                  {m.role === 'OWNER' && <Crown size={10} style={{ color: '#FFD700' }} />}
                </div>
                <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>@{m.user.username}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-xs font-black">
                {(m.goldCount ?? 0) > 0 && <span style={{ color: '#FFD700' }}>🥇{m.goldCount}</span>}
                {(m.silverCount ?? 0) > 0 && <span style={{ color: '#9EA0A5' }}>🥈{m.silverCount}</span>}
                {(m.bronzeCount ?? 0) > 0 && <span style={{ color: '#cd7f32' }}>🥉{m.bronzeCount}</span>}
                <span style={{ color: 'rgba(224,242,254,0.4)' }}>{m.medalCount ?? 0}🏅</span>
              </div>
            </div>
          ))}
        </div>
        {selected.isMember && (
          <button onClick={() => leave(selected.id)} disabled={leaving}
            className="w-full mt-6 py-3 rounded-xl text-sm font-bold"
            style={{ background: 'rgba(255,0,110,0.07)', border: '1px solid rgba(255,0,110,0.18)', color: 'rgba(255,0,110,0.65)' }}>
            {leaving ? 'Leaving…' : 'Leave Group'}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ background: 'rgba(7,7,26,0.95)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy size={18} style={{ color: '#FFD700' }} />
            <h1 className="text-xl font-black tracking-widest" style={{ color: '#e0f2fe', letterSpacing: '0.15em' }}>GROUPS</h1>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)' }}>
            <Plus size={12} /> Create
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Paste invite code to join…"
            className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
            style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.12)', color: '#e0f2fe' }} />
          <button onClick={joinByCode} disabled={joiningCode || !joinCode.trim()}
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)', opacity: joinCode.trim() ? 1 : 0.4 }}>
            {joiningCode ? '…' : 'Join'}
          </button>
        </div>
        <div className="flex gap-2">
          {(['mine','discover'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-lg text-[10px] font-black tracking-wider"
              style={{ background: tab === t ? 'rgba(var(--accent-rgb),0.15)' : 'transparent', border: `1px solid ${tab === t ? 'rgba(var(--accent-rgb),0.4)' : 'rgba(var(--accent-rgb),0.08)'}`, color: tab === t ? 'var(--accent)' : 'rgba(224,242,254,0.35)', letterSpacing: '0.1em' }}>
              {t === 'mine' ? `MY GROUPS${myGroups.length ? ` · ${myGroups.length}` : ''}` : 'DISCOVER'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? [...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-2xl animate-pulse mb-3" style={{ background: 'rgba(var(--accent-rgb),0.05)' }} />) :
         tab === 'mine' ? (
          myGroups.length === 0 ? (
            <div className="text-center py-16">
              <Trophy size={40} style={{ color: 'rgba(255,215,0,0.18)', margin: '0 auto 12px' }} />
              <p className="text-sm font-bold mb-1" style={{ color: 'rgba(224,242,254,0.35)' }}>No groups yet</p>
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.2)' }}>Create one or join with an invite code</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myGroups.map(g => (
                <button key={g.id} onClick={() => openGroup(g.id)} className="w-full text-left rounded-2xl p-4 transition-all"
                  style={{ background: 'rgba(7,7,26,0.85)', border: '1px solid rgba(var(--accent-rgb),0.09)' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{g.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="font-black text-sm truncate" style={{ color: '#e0f2fe' }}>{g.name}</p>
                        {g.isPrivate && <Lock size={10} style={{ color: 'rgba(var(--accent-rgb),0.35)' }} />}
                      </div>
                      {g.description && <p className="text-[10px] truncate mb-0.5" style={{ color: 'rgba(224,242,254,0.3)' }}>{g.description}</p>}
                      <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.25)' }}><Users size={8} className="inline mr-1" />{g._count?.members ?? g.members?.length ?? 0} members</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={e => copyInvite(g.inviteCode, e)} className="p-2 rounded-lg" style={{ background: 'rgba(var(--accent-rgb),0.07)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}>
                        {copied ? <Check size={12} style={{ color: 'var(--accent)' }} /> : <Share2 size={12} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />}
                      </button>
                      <ChevronRight size={14} style={{ color: 'rgba(var(--accent-rgb),0.35)' }} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
         ) : (
          discover.length === 0 ? (
            <div className="text-center py-16">
              <Users size={40} style={{ color: 'rgba(var(--accent-rgb),0.18)', margin: '0 auto 12px' }} />
              <p className="text-sm font-bold" style={{ color: 'rgba(224,242,254,0.35)' }}>No public groups yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {discover.map(g => (
                <div key={g.id} className="rounded-2xl p-4" style={{ background: 'rgba(7,7,26,0.85)', border: '1px solid rgba(var(--accent-rgb),0.07)' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{g.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate" style={{ color: '#e0f2fe' }}>{g.name}</p>
                      {g.description && <p className="text-[10px] truncate mb-0.5" style={{ color: 'rgba(224,242,254,0.3)' }}>{g.description}</p>}
                      <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.25)' }}><Users size={8} className="inline mr-1" />{g._count?.members ?? 0} members</p>
                    </div>
                    <button onClick={() => joinPublic(g.id)} disabled={joining === g.id}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold shrink-0"
                      style={{ background: 'rgba(var(--accent-rgb),0.13)', border: '1px solid rgba(var(--accent-rgb),0.33)', color: 'var(--accent)' }}>
                      {joining === g.id ? '…' : 'Join'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
         )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowCreate(false)}>
          <div className="w-full rounded-t-3xl p-6 pb-8" style={{ background: '#0d0d24', border: '1px solid rgba(var(--accent-rgb),0.15)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-black tracking-wider" style={{ color: '#e0f2fe' }}>CREATE GROUP</h2>
              <button onClick={() => setShowCreate(false)}><X size={18} style={{ color: 'rgba(224,242,254,0.4)' }} /></button>
            </div>
            <div className="flex gap-2 overflow-x-auto mb-4 pb-1" style={{ scrollbarWidth: 'none' }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))} className="text-2xl w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                  style={{ background: form.emoji === e ? 'rgba(var(--accent-rgb),0.2)' : 'rgba(var(--accent-rgb),0.05)', border: `1px solid ${form.emoji === e ? 'rgba(var(--accent-rgb),0.5)' : 'transparent'}` }}>
                  {e}
                </button>
              ))}
            </div>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Group name *"
              className="w-full px-4 py-3 rounded-xl text-sm mb-3 outline-none"
              style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }} />
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)"
              className="w-full px-4 py-3 rounded-xl text-sm mb-4 outline-none"
              style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }} />
            <label className="flex items-center gap-3 mb-5 cursor-pointer" onClick={() => setForm(f => ({ ...f, isPrivate: !f.isPrivate }))}>
              <div className="w-10 h-6 rounded-full relative transition-colors" style={{ background: form.isPrivate ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.15)' }}>
                <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all" style={{ left: form.isPrivate ? '20px' : '4px' }} />
              </div>
              <span className="text-sm" style={{ color: 'rgba(224,242,254,0.55)' }}>Private (invite only)</span>
            </label>
            <button onClick={create} disabled={creating || !form.name.trim()}
              className="w-full py-3.5 rounded-xl text-sm font-black tracking-wider"
              style={{ background: 'linear-gradient(135deg, var(--accent), rgba(61,90,254,0.8))', color: '#fff', opacity: form.name.trim() ? 1 : 0.5, letterSpacing: '0.08em' }}>
              {creating ? 'Creating…' : 'CREATE GROUP'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
