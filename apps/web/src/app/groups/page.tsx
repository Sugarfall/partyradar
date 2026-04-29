'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Trophy, Users, Plus, Share2, Check, ChevronRight, Lock, Crown, ArrowLeft, X, Zap, Swords, CheckCircle, Circle, Upload, Clock, Star } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface TaskCompletion { id: string; groupId: string; proof: string | null; completedAt: string }
interface ChallengeTask {
  id: string; title: string; description: string; hint: string | null
  taskType: string; points: number; orderIndex: number
  completions: TaskCompletion[]
}
interface ChallengeMatch {
  id: string; title: string; description: string; startsAt: string; endsAt: string
  tasks: ChallengeTask[]
  participants: Array<{ id: string; groupId: string; points: number; status: string; group: { id: string; name: string; emoji: string } }>
  winnerGroup: { id: string; name: string; emoji: string } | null
}
interface GroupChallenge {
  id: string; groupId: string; title: string; description: string
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MATCHED' | 'COMPLETED' | 'EXPIRED'
  expiresAt: string; respondedAt: string | null; points: number; city: string | null
  group: { id: string; name: string; emoji: string }
  match: ChallengeMatch | null
}

// ─── Task type icons / labels ─────────────────────────────────────────────────

const TASK_ICONS: Record<string, string> = {
  VISIT_VENUE: '🍻', TAKE_PHOTO: '📸', DANCE_OFF: '💃', TRIVIA: '🧠',
  SCAVENGER_HUNT: '🔍', SOCIAL_POST: '📱', KARAOKE: '🎤', COSTUME: '👒',
  SPEEDRUN: '⚡', RANDOM: '🎲',
}

const TASK_COLORS: Record<string, string> = {
  VISIT_VENUE: '#f59e0b', TAKE_PHOTO: '#8b5cf6', DANCE_OFF: '#ec4899',
  TRIVIA: '#3b82f6', SCAVENGER_HUNT: '#10b981', SOCIAL_POST: '#6366f1',
  KARAOKE: '#f97316', COSTUME: '#14b8a6', SPEEDRUN: '#eab308', RANDOM: '#a855f7',
}

// ─── Challenge Banner Component ───────────────────────────────────────────────

function ChallengeBanner({
  challenge, onRespond, onView,
}: {
  challenge: GroupChallenge
  onRespond: (id: string, accept: boolean) => void
  onView: (challenge: GroupChallenge) => void
}) {
  const [responding, setResponding] = useState<'accept' | 'decline' | null>(null)

  async function respond(accept: boolean) {
    setResponding(accept ? 'accept' : 'decline')
    await onRespond(challenge.id, accept)
    setResponding(null)
  }

  const timeLeft = (() => {
    const diff = new Date(challenge.expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'Expired'
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    return h > 0 ? `${h}h ${m}m left` : `${m}m left`
  })()

  if (challenge.status === 'PENDING') return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(236,72,153,0.18) 100%)', border: '1px solid rgba(99,102,241,0.3)' }}>
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <Zap size={13} style={{ color: '#a5b4fc' }} />
        <span className="text-[10px] font-black tracking-widest" style={{ color: '#a5b4fc', letterSpacing: '0.15em' }}>WEEKEND CHALLENGE</span>
        <div className="ml-auto flex items-center gap-1" style={{ color: 'rgba(165,180,252,0.5)', fontSize: 10 }}>
          <Clock size={9} />{timeLeft}
        </div>
      </div>
      <div className="px-4 pb-3">
        <p className="font-black text-sm mb-0.5" style={{ color: '#e0f2fe' }}>{challenge.title}</p>
        <p className="text-[11px] mb-3 leading-relaxed" style={{ color: 'rgba(224,242,254,0.45)' }}>{challenge.description}</p>
        <div className="flex gap-2">
          <button onClick={() => respond(true)} disabled={!!responding}
            className="flex-1 py-2.5 rounded-xl text-xs font-black tracking-wider"
            style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', opacity: responding ? 0.6 : 1, letterSpacing: '0.07em' }}>
            {responding === 'accept' ? 'Accepting…' : '⚡ ACCEPT'}
          </button>
          <button onClick={() => respond(false)} disabled={!!responding}
            className="px-5 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'rgba(239,68,68,0.6)', opacity: responding ? 0.6 : 1 }}>
            {responding === 'decline' ? '…' : 'Decline'}
          </button>
        </div>
      </div>
    </div>
  )

  if (challenge.status === 'ACCEPTED') return (
    <div className="rounded-2xl px-4 py-3 mb-3 flex items-center gap-3" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
      <div className="text-xl">⏳</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black" style={{ color: '#fde68a' }}>Looking for an opponent…</p>
        <p className="text-[10px]" style={{ color: 'rgba(253,230,138,0.45)' }}>You accepted the challenge for <strong>{challenge.group.emoji} {challenge.group.name}</strong>. Waiting to be matched.</p>
      </div>
      <Clock size={14} style={{ color: 'rgba(253,230,138,0.3)' }} />
    </div>
  )

  if (challenge.status === 'MATCHED' && challenge.match) return (
    <button onClick={() => onView(challenge)} className="w-full rounded-2xl overflow-hidden mb-3 text-left" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(99,102,241,0.12))', border: '1px solid rgba(239,68,68,0.25)' }}>
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <Swords size={12} style={{ color: '#fca5a5' }} />
        <span className="text-[10px] font-black tracking-widest" style={{ color: '#fca5a5', letterSpacing: '0.12em' }}>ACTIVE CHALLENGE</span>
        <div className="ml-auto flex items-center gap-1" style={{ color: 'rgba(252,165,165,0.45)', fontSize: 10 }}>
          <Clock size={9} />{timeLeft}
        </div>
      </div>
      <div className="px-4 pb-3">
        <p className="font-black text-sm mb-1" style={{ color: '#e0f2fe' }}>{challenge.match.title}</p>
        <div className="flex items-center gap-2 mb-2">
          {challenge.match.participants.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              {i > 0 && <span style={{ color: 'rgba(239,68,68,0.5)', fontSize: 12 }}>vs</span>}
              <span className="text-sm">{p.group.emoji}</span>
              <span className="text-xs font-bold truncate max-w-[80px]" style={{ color: '#e0f2fe' }}>{p.group.name}</span>
              <span className="text-xs font-black" style={{ color: '#a5b4fc' }}>{p.points}pts</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {challenge.match.tasks.map((t) => {
            const done = t.completions.some((c) => c.groupId === challenge.groupId)
            return (
              <div key={t.id} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{ background: done ? 'rgba(34,197,94,0.12)' : 'rgba(var(--accent-rgb),0.05)', border: `1px solid ${done ? 'rgba(34,197,94,0.3)' : 'rgba(var(--accent-rgb),0.1)'}` }}>
                {done ? '✅' : TASK_ICONS[t.taskType] ?? '🎯'}
              </div>
            )
          })}
          <span className="ml-auto text-[10px] font-black" style={{ color: 'var(--accent)' }}>TAP TO PLAY →</span>
        </div>
      </div>
    </button>
  )

  if (challenge.status === 'COMPLETED' && challenge.match) {
    const won = challenge.match.winnerGroup?.id === challenge.groupId
    return (
      <div className="rounded-2xl px-4 py-3 mb-3 flex items-center gap-3" style={{ background: won ? 'rgba(234,179,8,0.08)' : 'rgba(var(--accent-rgb),0.05)', border: `1px solid ${won ? 'rgba(234,179,8,0.2)' : 'rgba(var(--accent-rgb),0.08)'}` }}>
        <span className="text-2xl">{won ? '🏆' : '🤝'}</span>
        <div>
          <p className="text-xs font-black" style={{ color: won ? '#fde68a' : 'rgba(224,242,254,0.5)' }}>{won ? 'Challenge Won!' : 'Challenge Complete'}</p>
          <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{challenge.match.title} · {challenge.points} pts earned</p>
        </div>
      </div>
    )
  }

  return null
}

// ─── Match Detail View ────────────────────────────────────────────────────────

function MatchView({
  challenge, myGroupId, onBack, onTaskComplete,
}: {
  challenge: GroupChallenge
  myGroupId: string
  onBack: () => void
  onTaskComplete: (matchId: string, taskId: string, proof: string) => Promise<void>
}) {
  const match = challenge.match!
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [proofInputs, setProofInputs] = useState<Record<string, string>>({})
  const [showProof, setShowProof] = useState<string | null>(null)

  const myParticipant = match.participants.find((p) => p.groupId === myGroupId)
  const opponent = match.participants.find((p) => p.groupId !== myGroupId)
  const isExpired = new Date() > new Date(match.endsAt)
  const isDone = challenge.status === 'COMPLETED'

  async function complete(taskId: string) {
    const proof = proofInputs[taskId] ?? ''
    setSubmitting(taskId)
    try {
      await onTaskComplete(match.id, taskId, proof)
      setShowProof(null)
    } finally {
      setSubmitting(null) }
  }

  const myScore = myParticipant?.points ?? 0
  const opponentScore = opponent?.points ?? 0
  const winning = myScore >= opponentScore

  return (
    <div className="min-h-screen pb-28" style={{ background: '#07071a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4" style={{ background: 'rgba(7,7,26,0.95)', borderBottom: '1px solid rgba(239,68,68,0.15)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-1.5 rounded-lg" style={{ background: 'rgba(var(--accent-rgb),0.08)' }}>
            <ArrowLeft size={16} style={{ color: 'var(--accent)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Swords size={13} style={{ color: '#fca5a5' }} />
              <h1 className="text-sm font-black truncate" style={{ color: '#e0f2fe' }}>{match.title}</h1>
            </div>
            {isDone && match.winnerGroup && (
              <p className="text-[10px]" style={{ color: '#fde68a' }}>🏆 {match.winnerGroup.name} won!</p>
            )}
          </div>
          {!isDone && !isExpired && (
            <div className="text-right shrink-0">
              <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>ENDS</p>
              <p className="text-[10px] font-bold" style={{ color: 'rgba(224,242,254,0.55)' }}>
                {new Date(match.endsAt).toLocaleDateString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )}
        </div>

        {/* Scoreboard */}
        <div className="flex items-center gap-2 p-3 rounded-2xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
          <div className="flex-1 text-center">
            <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>{challenge.group.emoji} {challenge.group.name}</p>
            <p className="text-2xl font-black" style={{ color: winning ? '#fde68a' : 'rgba(224,242,254,0.5)' }}>{myScore}</p>
            <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>POINTS</p>
          </div>
          <div className="text-lg font-black shrink-0" style={{ color: 'rgba(239,68,68,0.5)' }}>VS</div>
          <div className="flex-1 text-center">
            <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>{opponent?.group.emoji} {opponent?.group.name ?? '???'}</p>
            <p className="text-2xl font-black" style={{ color: !winning ? '#fde68a' : 'rgba(224,242,254,0.5)' }}>{opponentScore}</p>
            <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>POINTS</p>
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="px-4 py-4">
        <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.15em' }}>TASKS</p>

        <div className="space-y-3">
          {match.tasks.map((task, i) => {
            const myDone = task.completions.some((c) => c.groupId === myGroupId)
            const opponentDone = task.completions.some((c) => c.groupId !== myGroupId)
            const color = TASK_COLORS[task.taskType] ?? '#6366f1'
            const icon = TASK_ICONS[task.taskType] ?? '🎯'
            const showingProof = showProof === task.id

            return (
              <div key={task.id} className="rounded-2xl overflow-hidden"
                style={{ background: myDone ? 'rgba(34,197,94,0.05)' : 'rgba(7,7,26,0.85)', border: `1px solid ${myDone ? 'rgba(34,197,94,0.2)' : `${color}20`}` }}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-black" style={{ color: myDone ? '#86efac' : '#e0f2fe' }}>{task.title}</p>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ background: `${color}20`, color }}>+{task.points}pts</span>
                      </div>
                      <p className="text-[11px] leading-relaxed mb-1.5" style={{ color: 'rgba(224,242,254,0.5)' }}>{task.description}</p>
                      {task.hint && (
                        <p className="text-[10px]" style={{ color: `${color}80` }}>💡 {task.hint}</p>
                      )}
                    </div>
                    <div className="shrink-0 ml-1">
                      {myDone
                        ? <CheckCircle size={20} style={{ color: '#4ade80' }} />
                        : <Circle size={20} style={{ color: 'rgba(var(--accent-rgb),0.2)' }} />}
                    </div>
                  </div>

                  {/* Completion status indicators */}
                  <div className="flex items-center gap-2 mt-2.5 ml-13 pl-0.5">
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: myDone ? '#4ade80' : 'rgba(224,242,254,0.25)' }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: myDone ? '#4ade80' : 'rgba(224,242,254,0.15)' }} />
                      {challenge.group.emoji} {myDone ? 'Completed' : 'Pending'}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: opponentDone ? '#f87171' : 'rgba(224,242,254,0.25)' }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: opponentDone ? '#f87171' : 'rgba(224,242,254,0.15)' }} />
                      {opponent?.group.emoji ?? '👾'} {opponentDone ? 'Completed' : 'Pending'}
                    </div>
                  </div>
                </div>

                {/* Submit proof area */}
                {!myDone && !isDone && !isExpired && (
                  <div style={{ borderTop: `1px solid ${color}15` }}>
                    {showingProof ? (
                      <div className="p-3 space-y-2">
                        <input
                          placeholder="Paste a photo URL, video link, or describe your proof…"
                          value={proofInputs[task.id] ?? ''}
                          onChange={(e) => setProofInputs((prev) => ({ ...prev, [task.id]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                          style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }}
                        />
                        <div className="flex gap-2">
                          <button onClick={() => complete(task.id)} disabled={submitting === task.id}
                            className="flex-1 py-2 rounded-xl text-xs font-black"
                            style={{ background: `${color}25`, border: `1px solid ${color}50`, color }}>
                            {submitting === task.id ? 'Submitting…' : '✓ Submit Proof'}
                          </button>
                          <button onClick={() => setShowProof(null)} className="px-3 py-2 rounded-xl text-xs"
                            style={{ background: 'rgba(var(--accent-rgb),0.05)', color: 'rgba(224,242,254,0.35)' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowProof(task.id)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold"
                        style={{ color: `${color}90` }}>
                        <Upload size={11} /> Submit Proof
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Description */}
        <p className="text-[11px] mt-5 text-center leading-relaxed" style={{ color: 'rgba(224,242,254,0.25)' }}>{match.description}</p>
      </div>
    </div>
  )
}

// ─── Main Groups Page ─────────────────────────────────────────────────────────

export default function GroupsPage() {
  const { dbUser } = useAuth()
  const [tab, setTab] = useState<'mine' | 'discover'>('mine')
  const [myGroups, setMyGroups] = useState<CompGroup[]>([])
  const [discover, setDiscover] = useState<CompGroup[]>([])
  const [challenges, setChallenges] = useState<GroupChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CompGroup | null>(null)
  const [activeChallenge, setActiveChallenge] = useState<GroupChallenge | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joiningCode, setJoiningCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', emoji: '🏆', isPrivate: false })
  const [creating, setCreating] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear timer on unmount
  useEffect(() => { return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current) } }, [])

  const EMOJIS = ['🏆','🎯','🔥','⚡','👑','🥇','🎉','🚀','💪','🌟','🎸','🎤','🍻','🦁','🐉']

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [groupsRes, challengesRes] = await Promise.allSettled([
        api.get('/comp-groups') as Promise<any>,
        api.get('/challenges/mine') as Promise<any>,
      ])
      if (groupsRes.status === 'fulfilled') {
        setMyGroups(groupsRes.value?.mine ?? [])
        setDiscover(groupsRes.value?.discover ?? [])
      }
      if (challengesRes.status === 'fulfilled') {
        setChallenges(challengesRes.value?.data ?? [])
      }
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
    setCopied(true)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  async function respondToChallenge(id: string, accept: boolean) {
    try {
      const res = await api.post(`/challenges/${id}/respond`, { accept }) as any
      await load() // Refresh so match data appears
      if (accept && res.data?.match) {
        const updated = challenges.find((c) => c.id === id)
        if (updated) setActiveChallenge({ ...updated, ...res.data, match: res.data.match })
      }
    } catch (e: any) { alert(e?.message ?? 'Something went wrong') }
  }

  async function completeTask(matchId: string, taskId: string, proof: string) {
    await api.post(`/challenges/match/${matchId}/task/${taskId}/complete`, { proof })
    await load()
    // Refresh the active challenge
    if (activeChallenge) {
      const refreshed = challenges.find((c) => c.id === activeChallenge.id)
      if (refreshed) setActiveChallenge(refreshed)
    }
  }

  // Active match view
  if (activeChallenge?.match) {
    const myGroupId = activeChallenge.groupId
    return (
      <MatchView
        challenge={activeChallenge}
        myGroupId={myGroupId}
        onBack={() => { setActiveChallenge(null); load() }}
        onTaskComplete={completeTask}
      />
    )
  }

  // Group detail view
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
        {/* Active challenges for this group */}
        {challenges.filter((c) => c.groupId === selected.id && ['PENDING','ACCEPTED','MATCHED'].includes(c.status)).map((c) => (
          <ChallengeBanner key={c.id} challenge={c} onRespond={respondToChallenge} onView={setActiveChallenge} />
        ))}

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

  // Pending/active challenges count for badge
  const activeChallengeCount = challenges.filter((c) => ['PENDING', 'MATCHED'].includes(c.status)).length

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ background: 'rgba(7,7,26,0.95)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy size={18} style={{ color: '#FFD700' }} />
            <h1 className="text-xl font-black tracking-widest" style={{ color: '#e0f2fe', letterSpacing: '0.15em' }}>GROUPS</h1>
            {activeChallengeCount > 0 && (
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black"
                style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(236,72,153,0.3))', color: '#c4b5fd', border: '1px solid rgba(99,102,241,0.3)' }}>
                <Zap size={9} />{activeChallengeCount}
              </span>
            )}
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
          <>
            {/* Challenge banners — shown at top of MY GROUPS tab */}
            {challenges.filter((c) => ['PENDING', 'ACCEPTED', 'MATCHED', 'COMPLETED'].includes(c.status)).map((c) => (
              <ChallengeBanner key={c.id} challenge={c} onRespond={respondToChallenge} onView={setActiveChallenge} />
            ))}

            {myGroups.length === 0 ? (
              <div className="text-center py-16">
                <Trophy size={40} style={{ color: 'rgba(255,215,0,0.18)', margin: '0 auto 12px' }} />
                <p className="text-sm font-bold mb-1" style={{ color: 'rgba(224,242,254,0.35)' }}>No groups yet</p>
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.2)' }}>Create one or join with an invite code</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myGroups.map(g => {
                  const groupChallenge = challenges.find((c) => c.groupId === g.id && ['PENDING','MATCHED'].includes(c.status))
                  return (
                    <button key={g.id} onClick={() => openGroup(g.id)} className="w-full text-left rounded-2xl p-4 transition-all"
                      style={{ background: 'rgba(7,7,26,0.85)', border: `1px solid ${groupChallenge ? 'rgba(99,102,241,0.25)' : 'rgba(var(--accent-rgb),0.09)'}` }}>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{g.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="font-black text-sm truncate" style={{ color: '#e0f2fe' }}>{g.name}</p>
                            {g.isPrivate && <Lock size={10} style={{ color: 'rgba(var(--accent-rgb),0.35)' }} />}
                            {groupChallenge && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                                style={{ background: groupChallenge.status === 'MATCHED' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)', color: groupChallenge.status === 'MATCHED' ? '#fca5a5' : '#c4b5fd' }}>
                                {groupChallenge.status === 'MATCHED' ? '⚔️ ACTIVE' : '⚡ CHALLENGED'}
                              </span>
                            )}
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
                  )
                })}
              </div>
            )}
          </>
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

      {/* Create modal */}
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
