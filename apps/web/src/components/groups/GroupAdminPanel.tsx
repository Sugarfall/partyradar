'use client'

/**
 * GroupAdminPanel
 * Shown to group OWNER and MODs — lets them manage members, edit settings, delete group.
 * Usage:
 *   <GroupAdminPanel groupId="..." myRole="OWNER" onClose={() => {}} />
 */

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  X, Shield, Crown, UserMinus, Settings, Trash2, ChevronDown,
  CheckCircle, AlertTriangle, Users, Save
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupMember {
  id: string
  userId: string
  role: string
  joinedAt: string
  user: { id: string; displayName: string; username: string; photoUrl?: string | null }
}

interface GroupSettings {
  name: string
  description: string
  emoji: string
  coverColor: string
}

type PanelTab = 'members' | 'settings'

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    OWNER: { label: 'Owner', color: '#ff006e' },
    MOD: { label: 'Mod', color: '#00c8ff' },
    MEMBER: { label: 'Member', color: '#555' },
  }
  const c = cfg[role] ?? cfg['MEMBER']!
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: `${c.color}20`, color: c.color, border: `1px solid ${c.color}40` }}
    >
      {role === 'OWNER' && <Crown size={9} />}
      {role === 'MOD' && <Shield size={9} />}
      {c.label}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  groupId: string
  groupName: string
  myRole: string  // 'OWNER' | 'MOD' | 'MEMBER'
  initialSettings?: Partial<GroupSettings>
  onClose: () => void
  onGroupDeleted?: () => void
  onSettingsSaved?: (settings: GroupSettings) => void
}

export default function GroupAdminPanel({
  groupId,
  groupName,
  myRole,
  initialSettings,
  onClose,
  onGroupDeleted,
  onSettingsSaved,
}: Props) {
  const isOwner = myRole === 'OWNER'
  const canModerate = myRole === 'OWNER' || myRole === 'MOD'

  const [tab, setTab] = useState<PanelTab>('members')
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [roleMenuOpen, setRoleMenuOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Settings form
  const [settings, setSettings] = useState<GroupSettings>({
    name: initialSettings?.name ?? groupName,
    description: initialSettings?.description ?? '',
    emoji: initialSettings?.emoji ?? '💬',
    coverColor: initialSettings?.coverColor ?? '#6366f1',
  })
  const [savingSettings, setSavingSettings] = useState(false)

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2800)
  }, [])

  // Load members
  useEffect(() => {
    if (!canModerate) return
    setLoadingMembers(true)
    api.get<{ data: GroupMember[] }>(`/groups/${groupId}/members`)
      .then((r) => setMembers(r.data))
      .catch(() => showToast('Failed to load members', false))
      .finally(() => setLoadingMembers(false))
  }, [groupId, canModerate, showToast])

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleSetRole = async (userId: string, role: 'MOD' | 'MEMBER') => {
    if (!isOwner) { showToast('Only the group owner can assign roles', false); return }
    setBusy(true)
    setRoleMenuOpen(null)
    try {
      await api.put(`/groups/${groupId}/members/${userId}/role`, { role })
      setMembers((prev) => prev.map((m) =>
        m.userId === userId ? { ...m, role: m.role === 'OWNER' ? 'OWNER' : role } : m
      ))
      showToast(`Role updated to ${role}`)
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to update role', false)
    } finally { setBusy(false) }
  }

  const handleKick = async (userId: string, displayName: string) => {
    if (!canModerate) return
    if (!confirm(`Remove ${displayName} from this group?`)) return
    setBusy(true)
    try {
      await api.delete(`/groups/${groupId}/members/${userId}`)
      setMembers((prev) => prev.filter((m) => m.userId !== userId))
      showToast(`${displayName} removed`)
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to kick member', false)
    } finally { setBusy(false) }
  }

  const handleSaveSettings = async () => {
    if (!canModerate) return
    setSavingSettings(true)
    try {
      await api.put(`/groups/${groupId}/settings`, settings)
      onSettingsSaved?.(settings)
      showToast('Settings saved!')
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to save settings', false)
    } finally { setSavingSettings(false) }
  }

  const handleDeleteGroup = async () => {
    if (!isOwner) { showToast('Only the group owner can delete the group', false); return }
    if (!confirm(`Permanently delete "${groupName}"? This will remove all messages and members. This cannot be undone.`)) return
    try {
      await api.delete(`/groups/${groupId}`)
      onGroupDeleted?.()
      onClose()
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to delete group', false)
    }
  }

  const PRESET_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#00c8ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl overflow-hidden"
        style={{ background: '#0d0d24', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '85vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            {isOwner ? <Crown size={16} style={{ color: '#ff006e' }} /> : <Shield size={16} style={{ color: '#00c8ff' }} />}
            <div>
              <h2 className="text-white font-bold text-base leading-none">{groupName}</h2>
              <p className="text-xs mt-0.5" style={{ color: isOwner ? '#ff006e' : '#00c8ff' }}>
                {isOwner ? 'Group Admin' : 'Moderator Panel'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <X size={16} style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3">
          {([['members', <Users size={13} />, 'Members'], ['settings', <Settings size={13} />, 'Settings']] as const).map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
              style={tab === id
                ? { background: '#00c8ff20', color: '#00c8ff', border: '1px solid #00c8ff40' }
                : { background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }
              }
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Toast */}
        {toast && (
          <div
            className="mx-4 mt-3 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold"
            style={{ background: toast.ok ? '#10b98115' : '#ff006e15', color: toast.ok ? '#10b981' : '#ff006e', border: `1px solid ${toast.ok ? '#10b98130' : '#ff006e30'}` }}
          >
            {toast.ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
            {toast.msg}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto px-4 pt-3 pb-8" style={{ maxHeight: 'calc(85vh - 180px)' }}>

          {/* ── Members tab ── */}
          {tab === 'members' && (
            <div className="space-y-2">
              {loadingMembers ? (
                <div className="text-center py-8 text-white/30 text-sm">Loading members…</div>
              ) : (
                members.map((m) => {
                  const isThisOwner = m.role === 'OWNER'
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 p-3 rounded-2xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        {m.user.photoUrl
                          ? <img src={m.user.photoUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-white/30 text-xs font-bold">{m.user.displayName[0]}</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white truncate">{m.user.displayName}</span>
                          <RoleBadge role={m.role} />
                        </div>
                        <div className="text-xs text-white/30">@{m.user.username}</div>
                      </div>
                      {/* Actions — owner can assign roles; mods can kick members */}
                      {!isThisOwner && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isOwner && (
                            <div className="relative">
                              <button
                                onClick={() => setRoleMenuOpen(roleMenuOpen === m.userId ? null : m.userId)}
                                disabled={busy}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-semibold"
                                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
                                title="Change role"
                              >
                                <Shield size={11} /> <ChevronDown size={9} />
                              </button>
                              {roleMenuOpen === m.userId && (
                                <div
                                  className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-2xl"
                                  style={{ background: '#12122a', border: '1px solid rgba(255,255,255,0.1)', minWidth: '130px' }}
                                >
                                  <button
                                    onClick={() => handleSetRole(m.userId, 'MOD')}
                                    className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-white/5 transition-colors"
                                    style={{ color: '#00c8ff' }}
                                  >
                                    🛡️ Make Moderator
                                  </button>
                                  <button
                                    onClick={() => handleSetRole(m.userId, 'MEMBER')}
                                    className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-white/5 transition-colors"
                                    style={{ color: 'rgba(255,255,255,0.6)' }}
                                  >
                                    👤 Set as Member
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          {/* Mods can only kick members; owner can kick anyone */}
                          {(isOwner || (myRole === 'MOD' && m.role === 'MEMBER')) && (
                            <button
                              onClick={() => handleKick(m.userId, m.user.displayName)}
                              disabled={busy}
                              className="p-1.5 rounded-xl"
                              style={{ background: '#ff006e15', color: '#ff006e', border: '1px solid #ff006e30' }}
                              title="Remove from group"
                            >
                              <UserMinus size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── Settings tab ── */}
          {tab === 'settings' && (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 block">Group Name</label>
                <input
                  value={settings.name}
                  onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
                  maxLength={40}
                  className="w-full px-4 py-3 rounded-2xl text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 block">Description</label>
                <textarea
                  value={settings.description}
                  onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))}
                  maxLength={200}
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl text-sm text-white outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>

              {/* Emoji */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 block">Emoji</label>
                <input
                  value={settings.emoji}
                  onChange={(e) => setSettings((s) => ({ ...s, emoji: e.target.value }))}
                  maxLength={4}
                  className="w-20 px-4 py-3 rounded-2xl text-2xl text-center outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>

              {/* Color */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 block">Cover Color</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSettings((s) => ({ ...s, coverColor: c }))}
                      className="w-9 h-9 rounded-xl transition-transform hover:scale-110"
                      style={{
                        background: c,
                        border: settings.coverColor === c ? '3px solid white' : '2px solid transparent',
                        outline: settings.coverColor === c ? `2px solid ${c}` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Save */}
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity"
                style={{ background: '#00c8ff', color: '#000', opacity: savingSettings ? 0.6 : 1 }}
              >
                <Save size={14} />
                {savingSettings ? 'Saving…' : 'Save Settings'}
              </button>

              {/* Danger zone — owner only */}
              {isOwner && (
                <div className="rounded-2xl p-4 mt-2" style={{ background: 'rgba(255,0,110,0.04)', border: '1px solid rgba(255,0,110,0.15)' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#ff006e' }}>DANGER ZONE</p>
                  <p className="text-xs text-white/40 mb-3">Deleting a group is permanent and removes all messages.</p>
                  <button
                    onClick={handleDeleteGroup}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-opacity hover:opacity-80"
                    style={{ background: '#ff006e20', color: '#ff006e', border: '1px solid #ff006e40' }}
                  >
                    <Trash2 size={14} /> Delete Group
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Close role menu on outside click */}
      {roleMenuOpen && (
        <div className="fixed inset-0 z-[60]" onClick={() => setRoleMenuOpen(null)} />
      )}
    </>
  )
}
