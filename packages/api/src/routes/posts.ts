import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'
import { moderateContent, recordViolation } from '../lib/moderation'
import { assertOwnImageUrl } from '../lib/cloudinary'
import { sendNotification } from '../lib/fcm'

/** Extract @username handles from text. Dedupes, caps at 10 to avoid abuse. */
function extractMentionUsernames(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_.]{2,30})/g) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of matches) {
    const handle = m.slice(1).toLowerCase()
    if (seen.has(handle)) continue
    seen.add(handle)
    out.push(handle)
    if (out.length >= 10) break
  }
  return out
}

const router = Router()

// ── Phase 2 schemas ────────────────────────────────────────────────────────
// Posts can now carry up to 10 media items (images + videos mixed) and a set
// of tags pinned either to the post as a whole or to a specific media slot.
// Reposts are first-class: pass `originalPostId` to re-share another post.
// Legacy single-`imageUrl` submissions still work; the server synthesizes a
// one-item `media` row for them.

const MAX_MEDIA_ITEMS = 10

const mediaItemSchema = z.object({
  url: z.string().url(),
  type: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'),
  cloudinaryPublicId: z.string().max(300).optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  durationSec: z.number().int().positive().max(86400).optional(),
  thumbnailUrl: z.string().url().optional(),
})

const postTagSchema = z.object({
  // Either user OR venue — enforced below.
  taggedUserId: z.string().cuid().optional(),
  taggedVenueId: z.string().cuid().optional(),
  // Index into the submitted `media` array (not the DB id — the row doesn't
  // exist until we create it). If null/undefined the tag applies to the post
  // as a whole. Ignored for legacy imageUrl-only posts.
  mediaIndex: z.number().int().min(0).max(MAX_MEDIA_ITEMS - 1).optional(),
  // Bounding box as fractions of the media's rendered size (0-1). All four
  // must be present for the tag to be pinned to a region.
  bboxX: z.number().min(0).max(1).optional(),
  bboxY: z.number().min(0).max(1).optional(),
  bboxW: z.number().min(0).max(1).optional(),
  bboxH: z.number().min(0).max(1).optional(),
})

const postSchema = z.object({
  // Legacy: single image URL. Kept for older mobile/web clients.
  imageUrl: z.string().url().optional(),
  // Preferred: ordered media array. When both are set, `media` wins.
  media: z.array(mediaItemSchema).max(MAX_MEDIA_ITEMS).optional(),
  text: z.string().max(2000).optional(),
  eventId: z.string().optional(),
  venueId: z.string().optional(),
  isStory: z.boolean().default(false),
  tags: z.array(postTagSchema).max(50).optional(),
  // Non-null → this post is a repost of another post. The original's media
  // is shown inside the repost card; this post's `text`/`media` is the
  // reposter's optional caption/quote-attached content.
  originalPostId: z.string().cuid().optional(),
})

const userSelect = { id: true, username: true, displayName: true, photoUrl: true }
const eventSelect = { id: true, name: true, startsAt: true, address: true, neighbourhood: true, coverImageUrl: true }
const venueSelect = { id: true, name: true, address: true, photoUrl: true }

// Shape used by every endpoint that returns a post — keeps clients
// deterministic as the schema grows.
const postInclude = {
  user: { select: userSelect },
  event: { select: eventSelect },
  venue: { select: venueSelect },
  media: { orderBy: { sortOrder: 'asc' as const } },
  tags: {
    include: {
      taggedUser: { select: userSelect },
      taggedVenue: { select: { id: true, name: true, address: true, photoUrl: true, type: true } },
    },
  },
  originalPost: {
    include: {
      user: { select: userSelect },
      event: { select: eventSelect },
      venue: { select: venueSelect },
      media: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
  _count: { select: { likes: true, comments: true, shares: true, reposts: true } },
}

/** POST /api/posts — create a post (supports carousels, tags, and reposts) */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = postSchema.parse(req.body)
    const userId = req.user!.dbUser.id

    // ── Normalize media ────────────────────────────────────────────────────
    // New clients send `media[]`. Legacy clients send `imageUrl`. Collapse
    // both into one canonical list so the rest of the handler is uniform.
    const mediaItems = body.media && body.media.length > 0
      ? body.media
      : body.imageUrl
        ? [{ url: body.imageUrl, type: 'IMAGE' as const }]
        : []

    // Reposts are valid with no new media/text — the caption is optional.
    const hasContent = mediaItems.length > 0 || !!body.text?.trim()
    if (!hasContent && !body.originalPostId) {
      throw new AppError('Post must have either media, text, or be a repost', 400)
    }

    // Only accept URLs that our own Cloudinary upload produced — blocks
    // people from hotlinking arbitrary images.
    try {
      for (const m of mediaItems) assertOwnImageUrl(m.url)
    } catch (e) {
      throw new AppError((e as Error).message, 400)
    }

    // ── Validate repost target ─────────────────────────────────────────────
    let originalPost: { id: string; userId: string; isStory: boolean } | null = null
    if (body.originalPostId) {
      originalPost = await prisma.post.findUnique({
        where: { id: body.originalPostId },
        select: { id: true, userId: true, isStory: true },
      })
      if (!originalPost) throw new AppError('Original post not found', 404)
      // No reposting your own post — same content twice in the feed is noise.
      if (originalPost.userId === userId) {
        throw new AppError("You can't repost your own post", 400)
      }
      // Stories are ephemeral by design; reposting them would leak them past
      // their expiry.
      if (originalPost.isStory) throw new AppError("Stories can't be reposted", 400)
    }

    // ── Validate tags ──────────────────────────────────────────────────────
    // Tags attach to either a user or a venue (xor). We validate IDs exist
    // up front so one bad tag doesn't leave a half-created post in the DB.
    const tags = body.tags ?? []
    for (const t of tags) {
      const hasUser = !!t.taggedUserId
      const hasVenue = !!t.taggedVenueId
      if (hasUser === hasVenue) {
        throw new AppError('Each tag must reference exactly one of taggedUserId or taggedVenueId', 400)
      }
      if (t.mediaIndex != null && t.mediaIndex >= mediaItems.length) {
        throw new AppError(`Tag mediaIndex ${t.mediaIndex} out of range (have ${mediaItems.length} media)`, 400)
      }
    }
    if (tags.length > 0) {
      const userIds = tags.map((t) => t.taggedUserId).filter((x): x is string => !!x)
      const venueIds = tags.map((t) => t.taggedVenueId).filter((x): x is string => !!x)
      if (userIds.length > 0) {
        const found = await prisma.user.count({ where: { id: { in: userIds } } })
        if (found !== new Set(userIds).size) throw new AppError('One or more tagged users not found', 400)
      }
      if (venueIds.length > 0) {
        const found = await prisma.venue.count({ where: { id: { in: venueIds } } })
        if (found !== new Set(venueIds).size) throw new AppError('One or more tagged venues not found', 400)
      }
    }

    // ── Content moderation ────────────────────────────────────────────────
    // Moderate the caption and every image url in one pass. Videos get only
    // text moderation since our moderator doesn't frame-sample yet.
    const firstImageUrl = mediaItems.find((m) => m.type === 'IMAGE')?.url
    const modResult = await moderateContent({ text: body.text, imageUrl: firstImageUrl })
    if (!modResult.passed) {
      await recordViolation({
        userId,
        contentType: 'post',
        content: body.text ?? undefined,
        contentUrl: firstImageUrl ?? mediaItems[0]?.url ?? undefined,
        flagType: modResult.flagType ?? 'ILLEGAL',
        confidence: modResult.confidence ?? 1,
        reason: modResult.reason,
        action: 'BLOCKED',
      })
      throw new AppError('Your post was blocked by our content filter. Repeated violations may result in account suspension.', 422)
    }

    const now = new Date()
    const expiresAt = body.isStory ? new Date(now.getTime() + 25 * 60 * 60 * 1000) : null

    // ── Create in a transaction so tags/media/repostCount stay consistent ─
    const created = await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          userId,
          // Keep Post.imageUrl populated with media[0] for backward-compat
          // readers (old clients, profile grid endpoint, etc.) — docs on the
          // schema say this is intentional.
          imageUrl: mediaItems[0]?.url ?? null,
          text: body.text ?? null,
          eventId: body.eventId ?? null,
          venueId: body.venueId ?? null,
          isStory: body.isStory,
          expiresAt,
          originalPostId: body.originalPostId ?? null,
          media: mediaItems.length > 0 ? {
            create: mediaItems.map((m, i) => ({
              url: m.url,
              type: m.type,
              cloudinaryPublicId: m.cloudinaryPublicId ?? null,
              sortOrder: i,
              width: m.width ?? null,
              height: m.height ?? null,
              durationSec: m.durationSec ?? null,
              thumbnailUrl: m.thumbnailUrl ?? null,
            })),
          } : undefined,
        },
        include: { media: { orderBy: { sortOrder: 'asc' as const } } },
      })

      // Create tags — we need the media IDs now, so build a lookup by index.
      if (tags.length > 0) {
        const mediaByIndex = post.media
        await tx.postTag.createMany({
          data: tags.map((t) => ({
            postId: post.id,
            mediaId: t.mediaIndex != null ? mediaByIndex[t.mediaIndex]?.id ?? null : null,
            taggedUserId: t.taggedUserId ?? null,
            taggedVenueId: t.taggedVenueId ?? null,
            bboxX: t.bboxX ?? null,
            bboxY: t.bboxY ?? null,
            bboxW: t.bboxW ?? null,
            bboxH: t.bboxH ?? null,
          })),
        })
      }

      // Bump the original post's repost counter (this also counts as an
      // implicit share — a PostShare row is created via the /share endpoint
      // when the user hits the share sheet, not here).
      if (originalPost) {
        await tx.post.update({
          where: { id: originalPost.id },
          data: { repostsCount: { increment: 1 } },
        })
      }

      return post.id
    })

    const post = await prisma.post.findUnique({
      where: { id: created },
      include: postInclude,
    })

    res.status(201).json({ data: post })
  } catch (err) {
    next(err)
  }
})

/** GET /api/posts/stories — active stories from following */
router.get('/stories', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id

    const followingRows = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    })
    const followingIds = followingRows.map((f) => f.followingId)

    const stories = await prisma.post.findMany({
      where: {
        userId: { in: [...followingIds, userId] },
        isStory: true,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: postInclude,
    })

    // Batch-fetch which stories the viewer has liked so the StoryViewer shows
    // the filled heart state correctly without an extra round-trip per item.
    const storyIds = stories.map((s) => s.id)
    const likedRows = storyIds.length > 0
      ? await prisma.postLike.findMany({
          where: { userId, postId: { in: storyIds } },
          select: { postId: true },
        })
      : []
    const likedSet = new Set(likedRows.map((l) => l.postId))

    const data = stories.map((s) => ({ ...s, hasLiked: likedSet.has(s.id) }))
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

/** GET /api/posts/my — my posts */
router.get('/my', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { userId },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: postInclude,
      }),
      prisma.post.count({ where: { userId } }),
    ])

    res.json({
      data: posts,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + posts.length < total,
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/posts/user/:username — public photo/video grid for a profile */
router.get('/user/:username', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params['username'] },
      select: { id: true },
    })
    if (!user) throw new AppError('User not found', 404)

    const posts = await prisma.post.findMany({
      where: {
        userId: user.id,
        isStory: false,
        OR: [
          { imageUrl: { not: null } },
          { media: { some: {} } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        id: true,
        imageUrl: true,
        text: true,
        likesCount: true,
        viewCount: true,
        commentsCount: true,
        createdAt: true,
        media: {
          orderBy: { sortOrder: 'asc' as const },
          select: { id: true, url: true, type: true, sortOrder: true, thumbnailUrl: true },
        },
      },
    })

    res.json({ data: posts })
  } catch (err) {
    next(err)
  }
})

/** GET /api/posts/event/:eventId — posts for an event */
router.get('/event/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { eventId, OR: [{ isStory: false }, { expiresAt: { gt: new Date() } }] },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: postInclude,
      }),
      prisma.post.count({
        where: { eventId, OR: [{ isStory: false }, { expiresAt: { gt: new Date() } }] },
      }),
    ])

    res.json({
      data: posts,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + posts.length < total,
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/posts/venue/:venueId — posts for a venue
 *  Includes posts that set Post.venueId directly (posted from the venue page)
 *  AND posts where a PostTag.taggedVenueId references this venue (tagged from feed). */
router.get('/venue/:venueId', async (req, res, next) => {
  try {
    const { venueId } = req.params
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const venueWhere = {
      AND: [
        {
          OR: [
            { venueId },
            { tags: { some: { taggedVenueId: venueId } } },
          ],
        },
        { OR: [{ isStory: false }, { expiresAt: { gt: new Date() } }] },
      ],
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: venueWhere,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: postInclude,
      }),
      prisma.post.count({ where: venueWhere }),
    ])

    res.json({
      data: posts,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + posts.length < total,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * In-memory view deduplication.
 * Key: `userId:postId` → last-viewed timestamp (ms).
 * Prevents the same authenticated user inflating viewCount within a 6-hour window.
 * Anonymous views are excluded entirely — too unreliable (bots, refreshes, crawlers).
 */
const POST_VIEW_WINDOW_MS = 6 * 60 * 60 * 1000
const postViewCache = new Map<string, number>()
setInterval(() => {
  const cutoff = Date.now() - POST_VIEW_WINDOW_MS
  for (const [k, ts] of postViewCache) if (ts < cutoff) postViewCache.delete(k)
}, 60 * 60 * 1000) // prune stale entries hourly

/** POST /api/posts/:id/view — record a video view (once per 6h per user) */
router.post('/:id/view', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user?.dbUser.id ?? null

    // Skip anonymous — bots and repeated refreshes make the number meaningless
    if (!userId) return res.json({ data: { recorded: false } })

    // Skip if this user already triggered a view within the last 6 hours
    const cacheKey = `${userId}:${id}`
    const lastView = postViewCache.get(cacheKey)
    if (lastView && Date.now() - lastView < POST_VIEW_WINDOW_MS) {
      return res.json({ data: { recorded: false } })
    }

    const post = await prisma.post.findUnique({ where: { id }, select: { id: true } })
    if (!post) throw new AppError('Post not found', 404)

    postViewCache.set(cacheKey, Date.now())
    await prisma.post.update({ where: { id }, data: { viewCount: { increment: 1 } } })
    res.json({ data: { recorded: true } })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/posts/:id/share — record a share event and bump sharesCount.
 *
 * Shape: `{ method: 'native' | 'copy' | 'repost' | string }`. We accept any
 * string so we can add channels without a deploy, but only the three above
 * are wired into the UI today. Idempotency is cheap-and-loose: we cap at one
 * share per user per method per 60s to stop button-mashing from inflating
 * the counter, but repeated shares through different channels all count.
 *
 * This endpoint does NOT create a repost (that's POST /api/posts with
 * `originalPostId`). When a user reposts, the compose flow hits *this*
 * endpoint with `method:'repost'` first for analytics, then posts the
 * repost row separately — keeping the share counter meaningful even if
 * the compose fails or is cancelled mid-flow.
 */
const shareSchema = z.object({
  method: z.string().min(1).max(32).default('native'),
})

router.post('/:id/share', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const postId = req.params['id']!
    const { method } = shareSchema.parse(req.body ?? {})

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    })
    if (!post) throw new AppError('Post not found', 404)

    // Dedupe rapid duplicate taps — only count one share per user per
    // method per minute toward the counter.
    const recent = await prisma.postShare.findFirst({
      where: {
        postId,
        userId,
        method,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
      select: { id: true },
    })

    if (recent) {
      res.json({ data: { ok: true, deduped: true } })
      return
    }

    await prisma.$transaction([
      prisma.postShare.create({ data: { postId, userId, method } }),
      prisma.post.update({
        where: { id: postId },
        data: { sharesCount: { increment: 1 } },
      }),
    ])

    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/posts/:id/insights — per-post analytics for the post's owner.
 *
 * Returns totals (views / likes / comments / shares by method / reposts), a
 * time series of engagement, and a "top commenters" shortlist. Only the
 * post's author can read this — nothing here is PII but it's not content we
 * want to leak on a public URL.
 *
 * Bucketing: if the post is younger than 48h we bucket by hour (most posts
 * get all their traffic in the first day); otherwise by day up to 30 days
 * back. We fetch raw timestamps with a generous cap (5 000 each) and bucket
 * in JS — avoids a Postgres-specific raw query, and any post hitting that
 * cap has enough signal in the most-recent window to chart cleanly anyway.
 */
router.get('/:id/insights', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const postId = req.params['id']!

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        userId: true,
        text: true,
        imageUrl: true,
        createdAt: true,
        viewCount: true,
        likesCount: true,
        commentsCount: true,
        sharesCount: true,
        repostsCount: true,
        user: { select: userSelect },
        media: {
          orderBy: { sortOrder: 'asc' as const },
          take: 1,
          select: { url: true, type: true, thumbnailUrl: true },
        },
      },
    })
    if (!post) throw new AppError('Post not found', 404)
    if (post.userId !== userId) throw new AppError('Forbidden', 403)

    const ROW_CAP = 5_000

    const [likes, comments, shares, commenterGroups] = await Promise.all([
      prisma.postLike.findMany({
        where: { postId },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: ROW_CAP,
      }),
      prisma.postComment.findMany({
        where: { postId },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: ROW_CAP,
      }),
      prisma.postShare.findMany({
        where: { postId },
        select: { createdAt: true, method: true },
        orderBy: { createdAt: 'asc' },
        take: ROW_CAP,
      }),
      // Top 5 commenters by volume. Group by userId, then hydrate with a
      // second query since groupBy can't join.
      prisma.postComment.groupBy({
        by: ['userId'],
        where: { postId },
        _count: { _all: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 5,
      }),
    ])

    // Hydrate top commenters with user records.
    const topCommenterIds = commenterGroups.map((g) => g.userId)
    const commenterUsers = topCommenterIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: topCommenterIds } },
          select: userSelect,
        })
      : []
    const commenterById = new Map(commenterUsers.map((u) => [u.id, u]))
    const topCommenters = commenterGroups
      .map((g) => {
        const user = commenterById.get(g.userId)
        return user ? { user, count: g._count._all } : null
      })
      .filter((x): x is { user: typeof commenterUsers[number]; count: number } => x !== null)

    // ── Shares by method ────────────────────────────────────────────────
    const sharesByMethod: Record<string, number> = {}
    for (const s of shares) {
      sharesByMethod[s.method] = (sharesByMethod[s.method] ?? 0) + 1
    }

    // ── Time series ─────────────────────────────────────────────────────
    const now = new Date()
    const ageMs = now.getTime() - post.createdAt.getTime()
    const HOUR = 60 * 60 * 1000
    const DAY = 24 * HOUR

    // Short-lived posts (< 48h) get hourly buckets for finer-grained
    // engagement shape. After 48h the detail is wasted, so we collapse to
    // daily up to 30d. Very old posts still return a 30-day window so the
    // chart has something to render.
    const bucketMs = ageMs < 48 * HOUR ? HOUR : DAY
    const bucket: 'hour' | 'day' = bucketMs === HOUR ? 'hour' : 'day'

    // Start from the post's creation, truncated to the bucket. End at now.
    function truncTo(d: Date, step: number): number {
      return Math.floor(d.getTime() / step) * step
    }
    const startMs = Math.max(
      truncTo(post.createdAt, bucketMs),
      // cap the window to avoid charting an entire year of nothing on a
      // long-dead post
      truncTo(new Date(now.getTime() - 30 * DAY), bucketMs),
    )
    const endMs = truncTo(now, bucketMs)
    const bucketCount = Math.min(
      Math.floor((endMs - startMs) / bucketMs) + 1,
      // hard cap in case of clock skew
      bucket === 'hour' ? 48 : 30,
    )

    type Point = { t: string; likes: number; comments: number; shares: number }
    const points: Point[] = []
    for (let i = 0; i < bucketCount; i++) {
      points.push({
        t: new Date(startMs + i * bucketMs).toISOString(),
        likes: 0,
        comments: 0,
        shares: 0,
      })
    }

    function addToBucket(tsMs: number, key: 'likes' | 'comments' | 'shares') {
      const idx = Math.floor((tsMs - startMs) / bucketMs)
      if (idx < 0 || idx >= points.length) return
      points[idx]![key] += 1
    }
    for (const l of likes)    addToBucket(l.createdAt.getTime(), 'likes')
    for (const c of comments) addToBucket(c.createdAt.getTime(), 'comments')
    for (const s of shares)   addToBucket(s.createdAt.getTime(), 'shares')

    res.json({
      data: {
        post: {
          id: post.id,
          text: post.text,
          imageUrl: post.imageUrl ?? post.media[0]?.url ?? null,
          createdAt: post.createdAt.toISOString(),
          user: post.user,
        },
        totals: {
          views: post.viewCount,
          likes: post.likesCount,
          comments: post.commentsCount,
          shares: post.sharesCount,
          reposts: post.repostsCount,
          sharesByMethod,
        },
        timeseries: { bucket, points },
        topCommenters,
        // Flag so the client can show "some events outside the window
        // weren't charted" if we hit the cap.
        capped: {
          likes: likes.length >= ROW_CAP,
          comments: comments.length >= ROW_CAP,
          shares: shares.length >= ROW_CAP,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/posts/:id/like — like/unlike a post (toggle) */
router.post('/:id/like', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const postId = req.params['id']!

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
    if (!post) throw new AppError('Post not found', 404)

    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    })

    if (existing) {
      // Unlike
      await prisma.$transaction([
        prisma.postLike.delete({ where: { postId_userId: { postId, userId } } }),
        prisma.post.update({ where: { id: postId }, data: { likesCount: { decrement: 1 } } }),
      ])
      res.json({ data: { liked: false } })
    } else {
      // Like
      await prisma.$transaction([
        prisma.postLike.create({ data: { postId, userId } }),
        prisma.post.update({ where: { id: postId }, data: { likesCount: { increment: 1 } } }),
      ])
      res.json({ data: { liked: true } })
    }
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/posts/:id — delete my post */
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id } = req.params

    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } })
    if (!post) throw new AppError('Post not found', 404)
    if (post.userId !== userId) throw new AppError('Forbidden', 403)

    await prisma.post.delete({ where: { id } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

// ── Comments ──────────────────────────────────────────────────────────────────

/** GET /api/posts/:id/comments — list comments for a post */
router.get('/:id/comments', async (req, res, next) => {
  try {
    const postId = req.params['id']!
    const { cursor, limit = '30' } = req.query as { cursor?: string; limit?: string }

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
    if (!post) throw new AppError('Post not found', 404)

    const comments = await prisma.postComment.findMany({
      where: { postId, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: Number(limit),
      include: {
        user: { select: userSelect },
      },
    })

    res.json({ data: comments })
  } catch (err) {
    next(err)
  }
})

/** POST /api/posts/:id/comments — add a comment */
router.post('/:id/comments', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId  = req.user!.dbUser.id
    const postId  = req.params['id']!
    const { text } = req.body as { text: string }

    if (!text?.trim()) throw new AppError('Comment text is required', 400)
    if (text.trim().length > 1000) throw new AppError('Comment too long (max 1000 chars)', 400)

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, userId: true } })
    if (!post) throw new AppError('Post not found', 404)

    // Moderate content
    const modResult = await moderateContent({ text: text.trim() })
    if (!modResult.passed) {
      throw new AppError('Comment blocked by content filter', 422)
    }

    const trimmed = text.trim()
    const [comment] = await prisma.$transaction([
      prisma.postComment.create({
        data: { postId, userId, text: trimmed },
        include: { user: { select: userSelect } },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      }),
    ])

    // ── Fire-and-forget notifications ──────────────────────────────
    // 1) Notify the post owner (unless they're commenting on their own post)
    // 2) Notify any @mentioned users we can resolve (distinct from owner + self)
    ;(async () => {
      const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true },
      })
      const actorName = actor?.displayName || actor?.username || 'Someone'
      const preview = trimmed.length > 80 ? trimmed.slice(0, 77) + '…' : trimmed

      const notifyIds = new Set<string>()

      if (post.userId && post.userId !== userId) {
        notifyIds.add(post.userId)
        await sendNotification({
          userId: post.userId,
          type: 'POST_COMMENT',
          title: `${actorName} commented on your post`,
          body: preview,
          data: { postId, commentId: comment.id },
        })
      }

      const handles = extractMentionUsernames(trimmed)
      if (handles.length > 0) {
        const mentioned = await prisma.user.findMany({
          where: { username: { in: handles, mode: 'insensitive' } },
          select: { id: true },
        })
        for (const m of mentioned) {
          if (m.id === userId) continue
          if (notifyIds.has(m.id)) continue
          notifyIds.add(m.id)
          await sendNotification({
            userId: m.id,
            type: 'COMMENT_MENTION',
            title: `${actorName} mentioned you in a comment`,
            body: preview,
            data: { postId, commentId: comment.id },
          })
        }
      }
    })().catch((err) => console.error('[comment-notify]', err))

    res.status(201).json({ data: comment })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/posts/:id/comments/:commentId — delete own comment */
router.delete('/:id/comments/:commentId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId    = req.user!.dbUser.id
    const postId    = req.params['id']!
    const commentId = req.params['commentId']!

    const comment = await prisma.postComment.findFirst({
      where: { id: commentId, postId },
      select: { id: true, userId: true },
    })
    if (!comment) throw new AppError('Comment not found', 404)

    // Allow post owner or comment author to delete
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { userId: true } })
    if (comment.userId !== userId && post?.userId !== userId) {
      throw new AppError('Forbidden', 403)
    }

    await prisma.$transaction([
      prisma.postComment.delete({ where: { id: commentId } }),
      prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { decrement: 1 } },
      }),
    ])

    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/posts/:id — get single post with meta */
router.get('/:id', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.dbUser.id ?? null
    const postId = req.params['id']!

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        ...postInclude,
        ...(userId ? { likes: { where: { userId }, select: { id: true } } } : {}),
      },
    })
    if (!post) throw new AppError('Post not found', 404)

    res.json({
      data: {
        ...post,
        hasLiked: userId ? ((post as any).likes?.length > 0) : false,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
