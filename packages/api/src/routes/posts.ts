import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'
import { moderateContent, recordViolation } from '../lib/moderation'

const router = Router()

const postSchema = z.object({
  imageUrl: z.string().url().optional(),
  text: z.string().max(2000).optional(),
  eventId: z.string().optional(),
  venueId: z.string().optional(),
  isStory: z.boolean().default(false),
})

const userSelect = { id: true, username: true, displayName: true, photoUrl: true }
const eventSelect = { id: true, name: true, startsAt: true, address: true, neighbourhood: true, coverImageUrl: true }
const venueSelect = { id: true, name: true, address: true, photoUrl: true }

/** POST /api/posts — create a post */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = postSchema.parse(req.body)
    const userId = req.user!.dbUser.id

    if (!body.imageUrl && !body.text) {
      throw new AppError('Post must have either imageUrl or text', 400)
    }

    // ── Content moderation ──────────────────────────────────────────────────
    const modResult = await moderateContent({ text: body.text, imageUrl: body.imageUrl })
    if (!modResult.passed) {
      await recordViolation({
        userId,
        contentType: 'post',
        content: body.text ?? undefined,
        contentUrl: body.imageUrl ?? undefined,
        flagType: modResult.flagType ?? 'ILLEGAL',
        confidence: modResult.confidence ?? 1,
        reason: modResult.reason,
        action: 'BLOCKED',
      })
      throw new AppError('Your post was blocked by our content filter. Repeated violations may result in account suspension.', 422)
    }

    const now = new Date()
    const expiresAt = body.isStory ? new Date(now.getTime() + 25 * 60 * 60 * 1000) : null

    const post = await prisma.post.create({
      data: {
        userId,
        imageUrl: body.imageUrl ?? null,
        text: body.text ?? null,
        eventId: body.eventId ?? null,
        venueId: body.venueId ?? null,
        isStory: body.isStory,
        expiresAt,
      },
      include: {
        user: { select: userSelect },
        event: { select: eventSelect },
        venue: { select: venueSelect },
      },
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
      include: {
        user: { select: userSelect },
        event: { select: eventSelect },
        venue: { select: venueSelect },
      },
    })

    res.json({ data: stories })
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
        include: {
          event: { select: eventSelect },
          venue: { select: venueSelect },
          _count: { select: { likes: true } },
        },
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
        imageUrl: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { id: true, imageUrl: true, text: true, likesCount: true, viewCount: true, createdAt: true },
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
        include: {
          user: { select: userSelect },
          venue: { select: venueSelect },
          _count: { select: { likes: true } },
        },
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

/** GET /api/posts/venue/:venueId — posts for a venue */
router.get('/venue/:venueId', async (req, res, next) => {
  try {
    const { venueId } = req.params
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { venueId, OR: [{ isStory: false }, { expiresAt: { gt: new Date() } }] },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: userSelect },
          event: { select: eventSelect },
          _count: { select: { likes: true } },
        },
      }),
      prisma.post.count({
        where: { venueId, OR: [{ isStory: false }, { expiresAt: { gt: new Date() } }] },
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

/** POST /api/posts/:id/view — record a video view (once per play) */
router.post('/:id/view', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const post = await prisma.post.findUnique({ where: { id }, select: { id: true } })
    if (!post) throw new AppError('Post not found', 404)
    await prisma.post.update({ where: { id }, data: { viewCount: { increment: 1 } } })
    res.json({ data: { ok: true } })
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

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
    if (!post) throw new AppError('Post not found', 404)

    // Moderate content
    const modResult = await moderateContent({ text: text.trim() })
    if (!modResult.passed) {
      throw new AppError('Comment blocked by content filter', 422)
    }

    const [comment] = await prisma.$transaction([
      prisma.postComment.create({
        data: { postId, userId, text: text.trim() },
        include: { user: { select: userSelect } },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      }),
    ])

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
        user: { select: userSelect },
        event: { select: eventSelect },
        venue: { select: venueSelect },
        _count: { select: { likes: true, comments: true } },
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
