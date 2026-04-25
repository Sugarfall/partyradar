import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

// ─── Task template fallback ──────────────────────────────────────────────────

interface TaskTemplate {
  title: string
  description: string
  hint: string
  taskType: string
  points: number
}

const TASK_POOL: TaskTemplate[] = [
  { taskType: 'VISIT_VENUE',    title: 'Bar Crawl Blitz',        points: 150, hint: 'The more unique the bar the better!',        description: 'Visit 3 different bars or venues in 2 hours. Take a group selfie at each one as proof.' },
  { taskType: 'TAKE_PHOTO',     title: 'Neon Sign Selfie',        points: 100, hint: 'The more creative the pose, the more style points!', description: 'Find a neon sign in the nightlife district. Take a group photo in front of it — everyone must be in frame.' },
  { taskType: 'DANCE_OFF',      title: 'Dance Floor Domination',  points: 200, hint: 'Energy counts more than skill here.',         description: 'Film a 30-second group dance video on a proper dance floor. Upload the video link as proof.' },
  { taskType: 'TRIVIA',         title: 'Local Knowledge Quiz',    points: 125, hint: 'Think about the city you\'re in!',            description: 'Find a pub quiz happening tonight and join it as a group. Screenshot your team\'s score sheet.' },
  { taskType: 'SCAVENGER_HUNT', title: 'Street Art Hunt',         points: 175, hint: 'Look on side streets and alleyways.',         description: 'Find and photograph 2 different pieces of street art or graffiti murals in the area.' },
  { taskType: 'KARAOKE',        title: 'Mic Drop Moment',         points: 250, hint: 'Own the room — the crowd reaction is part of the proof!', description: 'Get on a karaoke stage and perform a song with your whole group. Someone must record it.' },
  { taskType: 'SOCIAL_POST',    title: 'Viral Moment',            points: 100, hint: 'Make it shareable — the sillier the better.', description: 'Post a group boomerang or reel from tonight out with the hashtag #PartyRadarChallenge. Share the link as proof.' },
  { taskType: 'COSTUME',        title: 'Dress Code Chaos',        points: 150, hint: 'Raid the charity shops if you have to.',      description: 'All group members must be wearing a matching accessory (hat, colour, item) by midnight. Group photo required.' },
  { taskType: 'SPEEDRUN',       title: 'Speed Round',             points: 225, hint: 'You have 45 minutes — go!',                   description: 'In 45 minutes: order one cocktail each at 2 different bars, find a live musician, and get one stranger to join a group photo.' },
  { taskType: 'RANDOM',         title: 'Random Act of Fun',       points: 175, hint: 'Be spontaneous — that\'s the whole point.',   description: 'Convince a stranger to attempt a dance move, then film yourselves teaching them. Post the clip as proof.' },
  { taskType: 'VISIT_VENUE',    title: 'Rooftop or Bust',         points: 175, hint: 'Sky bars, rooftop terraces, any elevated bar counts.', description: 'Find and visit a rooftop bar, sky lounge, or any venue above ground floor. Group selfie with the skyline.' },
  { taskType: 'TAKE_PHOTO',     title: 'Crowd Surf Challenge',    points: 150, hint: 'Pick a busy spot and blend in!',              description: 'Take a photo where everyone in the group looks like a different stranger from the venue crowd — no two people in the same pose.' },
  { taskType: 'SCAVENGER_HUNT', title: 'Colour Hunt',             points: 125, hint: 'You\'d be surprised how long this takes.',    description: 'Find and photograph the colours of the rainbow (red, orange, yellow, green, blue, purple) as found naturally in the city at night.' },
  { taskType: 'SOCIAL_POST',    title: 'Guess the Venue',         points: 100, hint: 'No geo-tags allowed — make them guess!',      description: 'Post a cryptic photo of your current venue on social media without naming it. First person to comment the correct venue wins you bonus points.' },
  { taskType: 'DANCE_OFF',      title: 'Flash Mob',               points: 300, hint: 'Surprise is the key ingredient.',             description: 'Pick a public spot (not a dance floor), count down together, and break into a choreographed group dance for at least 30 seconds. Film the reactions.' },
]

function pickTasks(count = 4): TaskTemplate[] {
  const shuffled = [...TASK_POOL].sort(() => Math.random() - 0.5)
  // Ensure variety — pick from different taskTypes where possible
  const seen = new Set<string>()
  const picked: TaskTemplate[] = []
  for (const t of shuffled) {
    if (picked.length >= count) break
    if (!seen.has(t.taskType)) { seen.add(t.taskType); picked.push(t) }
  }
  // Top up if needed
  for (const t of shuffled) {
    if (picked.length >= count) break
    if (!picked.includes(t)) picked.push(t)
  }
  return picked.slice(0, count)
}

async function generateTasksWithAI(city: string, theme: string): Promise<TaskTemplate[]> {
  const apiKey = process.env['PERPLEXITY_API_KEY']
  if (!apiKey) return pickTasks(4)

  const prompt = `You are a nightlife challenge designer for PartyRadar, a social party app.

Design 4 fun, competitive group challenges for two groups of friends competing against each other on a night out in ${city}.
Theme: "${theme}"

Rules:
- Each task must be doable in a real nightlife venue on a Saturday night
- Tasks should require genuine group effort and produce verifiable proof (photo, video, screenshot)
- Vary the task types: some physical/dancing, some venue visits, some creative/social
- Make tasks exciting and slightly ridiculous — this is a party app!
- Points should reflect difficulty (easy=100, medium=150, hard=200-300)

Return ONLY valid JSON, no markdown, no explanation:
{
  "tasks": [
    {
      "title": "Short punchy title",
      "description": "Exact instructions in 1-2 sentences",
      "hint": "One encouraging tip",
      "taskType": "VISIT_VENUE|TAKE_PHOTO|DANCE_OFF|TRIVIA|SCAVENGER_HUNT|SOCIAL_POST|KARAOKE|COSTUME|SPEEDRUN|RANDOM",
      "points": 100
    }
  ]
}`

  try {
    const aiRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.9,
      }),
    })
    if (!aiRes.ok) return pickTasks(4)
    const aiData = await aiRes.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = aiData.choices?.[0]?.message?.content ?? ''
    const jsonStr = raw.replace(/```(?:json)?\n?/g, '').replace(/```$/g, '').trim()
    const parsed = JSON.parse(jsonStr) as { tasks: TaskTemplate[] }
    if (Array.isArray(parsed.tasks) && parsed.tasks.length >= 3) {
      return parsed.tasks.slice(0, 4)
    }
  } catch (err) {
    console.warn('[Challenges] AI task generation failed, using templates:', err)
  }
  return pickTasks(4)
}

// ─── Helper: get user's group memberships ────────────────────────────────────

async function getUserGroupIds(userId: string): Promise<string[]> {
  const memberships = await prisma.competitionMember.findMany({
    where: { userId },
    select: { groupId: true },
  })
  return memberships.map((m) => m.groupId)
}

// ─── GET /mine — challenges for all my groups ────────────────────────────────

router.get('/mine', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const groupIds = await getUserGroupIds(userId)
    if (groupIds.length === 0) { res.json({ data: [] }); return }

    const challenges = await prisma.groupChallenge.findMany({
      where: {
        groupId: { in: groupIds },
        status: { notIn: ['DECLINED', 'EXPIRED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        group: { select: { id: true, name: true, emoji: true } },
        match: {
          include: {
            tasks: {
              orderBy: { orderIndex: 'asc' },
              include: { completions: { where: { groupId: { in: groupIds } } } },
            },
            participants: {
              include: { group: { select: { id: true, name: true, emoji: true } } },
            },
          },
        },
      },
      take: 20,
    })

    res.json({ data: challenges })
  } catch (err) { next(err) }
})

// ─── POST /:id/respond — accept or decline ───────────────────────────────────

router.post('/:id/respond', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id } = req.params
    const { accept } = req.body as { accept: boolean }

    const challenge = await prisma.groupChallenge.findUnique({
      where: { id },
      include: { group: { include: { members: { select: { userId: true } } } } },
    })
    if (!challenge) { res.status(404).json({ error: 'Challenge not found' }); return }

    const isMember = challenge.group.members.some((m) => m.userId === userId)
    if (!isMember) { res.status(403).json({ error: 'You are not in this group' }); return }

    if (challenge.status !== 'PENDING') {
      res.status(400).json({ error: `Challenge is already ${challenge.status.toLowerCase()}` })
      return
    }

    if (new Date() > challenge.expiresAt) {
      await prisma.groupChallenge.update({ where: { id }, data: { status: 'EXPIRED' } })
      res.status(400).json({ error: 'Challenge has expired' })
      return
    }

    if (!accept) {
      await prisma.groupChallenge.update({
        where: { id },
        data: { status: 'DECLINED', respondedAt: new Date() },
      })
      res.json({ data: { status: 'DECLINED' } })
      return
    }

    // Accept — look for another group that also accepted in the same dispatch wave
    const updated = await prisma.groupChallenge.update({
      where: { id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    })

    let matchId: string | null = null

    if (challenge.dispatchKey) {
      const opponent = await prisma.groupChallenge.findFirst({
        where: {
          dispatchKey: challenge.dispatchKey,
          status: 'ACCEPTED',
          id: { not: id },
        },
      })

      if (opponent) {
        // Create the match
        const now = new Date()
        const sunday = new Date(now)
        // End of Sunday = find next Sunday 23:59
        const dayOfWeek = now.getDay() // 0=Sun, 5=Fri, 6=Sat
        const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
        sunday.setDate(now.getDate() + daysToSunday)
        sunday.setHours(23, 59, 59, 999)

        const themes = [
          'The Big Night Out', 'Midnight Mayhem', 'City Crawl Championship',
          'Lights & Legends', 'The Party Games', 'Weekend Warriors',
        ]
        const theme = themes[Math.floor(Math.random() * themes.length)]!
        const city = challenge.city ?? opponent.city ?? 'your city'

        // Generate AI tasks
        const taskTemplates = await generateTasksWithAI(city, theme)

        const match = await prisma.challengeMatch.create({
          data: {
            title: theme,
            description: `Two groups compete across ${taskTemplates.length} challenges tonight in ${city}. First to complete all tasks wins!`,
            startsAt: now,
            endsAt: sunday,
            tasks: {
              create: taskTemplates.map((t, i) => ({
                title: t.title,
                description: t.description,
                hint: t.hint,
                taskType: t.taskType as any,
                points: t.points,
                orderIndex: i,
              })),
            },
          },
        })
        matchId = match.id

        // Link both challenges to the match and set MATCHED
        await prisma.groupChallenge.updateMany({
          where: { id: { in: [id, opponent.id] } },
          data: { status: 'MATCHED', matchId: match.id },
        })
      }
    }

    const result = await prisma.groupChallenge.findUnique({
      where: { id: updated.id },
      include: {
        match: {
          include: {
            tasks: { orderBy: { orderIndex: 'asc' } },
            participants: { include: { group: { select: { id: true, name: true, emoji: true } } } },
          },
        },
      },
    })

    res.json({ data: result, matched: !!matchId })
  } catch (err) { next(err) }
})

// ─── GET /match/:matchId — match detail with tasks + completions ──────────────

router.get('/match/:matchId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { matchId } = req.params

    const match = await prisma.challengeMatch.findUnique({
      where: { id: matchId },
      include: {
        tasks: {
          orderBy: { orderIndex: 'asc' },
          include: { completions: true },
        },
        participants: {
          include: {
            group: {
              select: { id: true, name: true, emoji: true, members: { select: { userId: true } } },
            },
          },
        },
        winnerGroup: { select: { id: true, name: true, emoji: true } },
      },
    })

    if (!match) { res.status(404).json({ error: 'Match not found' }); return }

    // Check that requesting user is in one of the participant groups
    const userGroupId = match.participants.find((p) =>
      p.group.members.some((m) => m.userId === userId),
    )?.groupId

    if (!userGroupId) { res.status(403).json({ error: 'You are not part of this match' }); return }

    res.json({ data: match, myGroupId: userGroupId })
  } catch (err) { next(err) }
})

// ─── POST /match/:matchId/task/:taskId/complete — submit proof ────────────────

router.post('/match/:matchId/task/:taskId/complete', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { matchId, taskId } = req.params
    const { proof } = req.body as { proof?: string }

    // Find the match
    const match = await prisma.challengeMatch.findUnique({
      where: { id: matchId },
      include: {
        tasks: { select: { id: true, points: true } },
        participants: {
          include: { group: { select: { id: true, members: { select: { userId: true } } } } },
        },
      },
    })
    if (!match) { res.status(404).json({ error: 'Match not found' }); return }
    if (new Date() > match.endsAt) { res.status(400).json({ error: 'Match has ended' }); return }

    // Find this user's group in the match
    const myParticipant = match.participants.find((p) =>
      p.group.members.some((m) => m.userId === userId),
    )
    if (!myParticipant) { res.status(403).json({ error: 'You are not in this match' }); return }

    const task = match.tasks.find((t) => t.id === taskId)
    if (!task) { res.status(404).json({ error: 'Task not found in this match' }); return }

    // Upsert the completion
    const completion = await prisma.taskCompletion.upsert({
      where: { taskId_groupId: { taskId, groupId: myParticipant.groupId } },
      create: { taskId, groupId: myParticipant.groupId, proof: proof ?? null },
      update: { proof: proof ?? null, completedAt: new Date() },
    })

    // Update group's points on the challenge
    await prisma.groupChallenge.updateMany({
      where: { matchId, groupId: myParticipant.groupId },
      data: { points: { increment: task.points } },
    })

    // Check if all tasks are completed by both groups → determine winner
    const allTaskIds = match.tasks.map((t) => t.id)
    const allGroupIds = match.participants.map((p) => p.groupId)

    const completionCount = await prisma.taskCompletion.count({
      where: { taskId: { in: allTaskIds }, groupId: { in: allGroupIds } },
    })

    if (completionCount >= allTaskIds.length * allGroupIds.length) {
      // All tasks done — find winner by points
      const scores = await prisma.groupChallenge.findMany({
        where: { matchId },
        select: { groupId: true, points: true },
      })
      scores.sort((a, b) => b.points - a.points)
      const winnerId = scores[0]?.groupId ?? null

      await prisma.challengeMatch.update({
        where: { id: matchId },
        data: { winnerId },
      })
      await prisma.groupChallenge.updateMany({
        where: { matchId },
        data: { status: 'COMPLETED' },
      })
    }

    res.json({ data: completion })
  } catch (err) { next(err) }
})

// ─── POST /dispatch — trigger weekend challenge dispatch ───────────────────────
// Called by cron on Friday evening. Also accessible to admin for testing.

router.post('/dispatch', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
    // Allow admin users or internal header (for cron)
    const internalKey = process.env['INTERNAL_API_KEY']
    const authHeader = req.headers['authorization']
    const isInternal = internalKey && authHeader === `Bearer ${internalKey}`
    if (!user?.isAdmin && !isInternal) { res.status(403).json({ error: 'Admin only' }); return }

    const { lat, lng, radiusKm = 50 } = req.body as { lat?: number; lng?: number; radiusKm?: number }

    const dispatched = await dispatchWeekendChallenges(lat, lng, radiusKm)
    res.json({ data: dispatched })
  } catch (err) { next(err) }
})

// ─── Core dispatch logic (also called from cron in index.ts) ─────────────────

export async function dispatchWeekendChallenges(
  filterLat?: number,
  filterLng?: number,
  radiusKm = 50,
): Promise<{ groupCount: number; challengeCount: number }> {
  // Find active competition groups with 2+ members
  const groups = await prisma.competitionGroup.findMany({
    include: {
      members: {
        include: {
          user: { select: { lastKnownLat: true, lastKnownLng: true, displayName: true } },
        },
      },
    },
  })

  // Filter groups that have at least 2 members with known location
  const eligible = groups.filter((g) => {
    const located = g.members.filter((m) => m.user.lastKnownLat != null)
    return located.length >= 2
  })

  if (eligible.length === 0) return { groupCount: 0, challengeCount: 0 }

  // Compute group centroid from member average location
  type GroupWithCoords = (typeof eligible)[number] & { avgLat: number; avgLng: number; city: string }
  const withCoords: GroupWithCoords[] = eligible.map((g) => {
    const located = g.members.filter((m) => m.user.lastKnownLat != null)
    const avgLat = located.reduce((s, m) => s + (m.user.lastKnownLat ?? 0), 0) / located.length
    const avgLng = located.reduce((s, m) => s + (m.user.lastKnownLng ?? 0), 0) / located.length
    return { ...g, avgLat, avgLng, city: 'Nearby' }
  })

  // Optional filter by a specific area
  const filtered = filterLat != null && filterLng != null
    ? withCoords.filter((g) => {
        const dlat = g.avgLat - filterLat
        const dlng = g.avgLng - filterLng
        const km = Math.sqrt(dlat * dlat * 12_321 + dlng * dlng * 9_801)
        return km <= radiusKm
      })
    : withCoords

  if (filtered.length === 0) return { groupCount: 0, challengeCount: 0 }

  // Sunday midnight for this weekend
  const now = new Date()
  const sunday = new Date(now)
  const dayOfWeek = now.getDay()
  const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
  sunday.setDate(now.getDate() + daysToSunday)
  sunday.setHours(23, 59, 59, 999)

  // Cluster groups by proximity (100km buckets)
  const BUCKET_SIZE = 1.0 // ~100km per degree
  const clusters = new Map<string, typeof filtered>()
  for (const g of filtered) {
    const key = `${Math.round(g.avgLat / BUCKET_SIZE)}:${Math.round(g.avgLng / BUCKET_SIZE)}`
    const bucket = clusters.get(key) ?? []
    bucket.push(g)
    clusters.set(key, bucket)
  }

  const challengeTitles = [
    '🎉 Weekend Battle Challenge',
    '🔥 Friday Night Throwdown',
    '⚡ The City Clash',
    '👑 Weekend Warriors Showdown',
    '🏆 Saturday Night Rumble',
  ]

  let totalChallenges = 0
  let totalGroups = 0

  for (const [, clusterGroups] of clusters) {
    // Shuffle and pick up to 10 groups from this cluster
    const shuffled = [...clusterGroups].sort(() => Math.random() - 0.5)
    const chosen = shuffled.slice(0, 10)
    const title = challengeTitles[Math.floor(Math.random() * challengeTitles.length)]!
    const dispatchKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // Skip groups that already have an active/pending challenge this weekend
    const existingIds = await prisma.groupChallenge.findMany({
      where: {
        groupId: { in: chosen.map((g) => g.id) },
        expiresAt: { gte: now },
        status: { notIn: ['DECLINED', 'EXPIRED'] },
      },
      select: { groupId: true },
    })
    const alreadyChallenged = new Set(existingIds.map((e) => e.groupId))
    const toChallenge = chosen.filter((g) => !alreadyChallenged.has(g.id))

    if (toChallenge.length === 0) continue

    await prisma.groupChallenge.createMany({
      data: toChallenge.map((g) => ({
        groupId: g.id,
        title,
        description: `Your group has been selected for this weekend's city-wide challenge! Accept to compete against another local group. Complete AI-generated tasks, earn points, and prove your crew is the best in the city.`,
        status: 'PENDING',
        expiresAt: sunday,
        lat: g.avgLat,
        lng: g.avgLng,
        city: g.city,
        dispatchKey,
      })),
    })

    totalChallenges += toChallenge.length
    totalGroups += toChallenge.length
  }

  console.log(`[Challenges] Dispatched ${totalChallenges} challenges to ${totalGroups} groups`)
  return { groupCount: totalGroups, challengeCount: totalChallenges }
}

export default router
