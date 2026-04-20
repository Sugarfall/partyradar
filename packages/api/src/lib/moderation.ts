/**
 * Content Moderation Service
 *
 * Layer 1 — Keyword blocklist (instant, no API, zero cost)
 * Layer 2 — OpenAI Moderation API for text (free, requires OPENAI_API_KEY)
 * Layer 3 — Sightengine for images (optional, requires SIGHTENGINE_USER + SIGHTENGINE_SECRET)
 *
 * Each check returns ModerationResult { passed, flagType, confidence, reason }
 * If passed=false the caller should reject/log the content.
 */

import { prisma } from '@partyradar/db'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModerationResult {
  passed: boolean
  flagType?: string     // 'SEXUAL' | 'VIOLENCE' | 'ILLEGAL' | 'HATE' | 'SPAM' | 'KEYWORD'
  confidence?: number   // 0–1
  reason?: string       // human-readable
}

export type ContentType =
  | 'text'
  | 'image'
  | 'bio'
  | 'group_message'
  | 'post'
  | 'event'

// ─── Layer 1: Keyword blocklist ───────────────────────────────────────────────
// Catches obvious cases instantly without any API call.
// Deliberately conservative — only terms with near-zero legitimate usage.

const HARD_BLOCKLIST = [
  // CSAM / illegal
  'child porn', 'cp porn', 'lolita', 'pedo', 'pedophil', 'underage sex',
  'jailbait', 'preteen nude', 'teen nude', 'minor nude',
  // Illegal drugs sale (sale/deal context, not casual mention)
  'buy heroin', 'sell heroin', 'buy cocaine', 'sell cocaine',
  'drug deal', 'buy meth', 'crystal meth sale',
  // Explicit solicitation
  'escort service', 'sex worker for hire', 'buy sex', 'prostitut',
  // Violence / terrorism
  'bomb threat', 'shooting plan', 'kill list', 'terrorist attack',
  'mass shooting',
]

function keywordCheck(text: string): ModerationResult {
  const lower = text.toLowerCase()
  for (const term of HARD_BLOCKLIST) {
    if (lower.includes(term)) {
      return { passed: false, flagType: 'KEYWORD', confidence: 1.0, reason: `Blocked keyword: "${term}"` }
    }
  }
  return { passed: true }
}

// ─── Layer 2: OpenAI Moderation API (text) ───────────────────────────────────
// Free endpoint — does not count against token quota.
// Detects: sexual, sexual/minors, violence, violence/graphic, hate, hate/threatening,
//          self-harm, self-harm/instructions, harassment

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations'

export async function moderateText(
  text: string,
  shortCircuitOnKeyword = true,
): Promise<ModerationResult> {
  // Skip very short or empty text
  if (!text?.trim() || text.trim().length < 3) return { passed: true }

  // Layer 1 — keyword check
  if (shortCircuitOnKeyword) {
    const kw = keywordCheck(text)
    if (!kw.passed) return kw
  }

  // Layer 2 — OpenAI (only if API key configured)
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) return { passed: true } // graceful skip

  try {
    const res = await fetch(OPENAI_MODERATION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(4000),
    })

    if (!res.ok) return { passed: true } // don't block on API error

    const data = await res.json() as {
      results: Array<{
        flagged: boolean
        categories: Record<string, boolean>
        category_scores: Record<string, number>
      }>
    }

    const result = data.results[0]
    if (!result || !result.flagged) return { passed: true }

    // Find the highest-scoring category
    const scores = result.category_scores
    const topCategory = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
    const [category, confidence] = topCategory ?? ['unknown', 1]

    // Map OpenAI category → our flagType
    const flagTypeMap: Record<string, string> = {
      'sexual': 'SEXUAL',
      'sexual/minors': 'ILLEGAL',
      'violence': 'VIOLENCE',
      'violence/graphic': 'VIOLENCE',
      'hate': 'HATE',
      'hate/threatening': 'HATE',
      'harassment': 'HATE',
      'harassment/threatening': 'HATE',
      'self-harm': 'VIOLENCE',
      'self-harm/instructions': 'ILLEGAL',
    }

    return {
      passed: false,
      flagType: flagTypeMap[category] ?? 'ILLEGAL',
      confidence: confidence as number,
      reason: `OpenAI moderation flagged: ${category}`,
    }
  } catch {
    // API timeout / network error — don't block, log silently
    return { passed: true }
  }
}

// ─── Layer 3: Sightengine image moderation ────────────────────────────────────
// Checks imageUrl for nudity and offensive content synchronously.
// Requires SIGHTENGINE_USER + SIGHTENGINE_SECRET env vars.
// Free tier: 100 checks/day.

export async function moderateImage(imageUrl: string): Promise<ModerationResult> {
  if (!imageUrl) return { passed: true }

  // Skip Cloudinary transformations — check original
  const apiUser = process.env['SIGHTENGINE_USER']
  const apiSecret = process.env['SIGHTENGINE_SECRET']
  if (!apiUser || !apiSecret) return { passed: true } // graceful skip

  try {
    const params = new URLSearchParams({
      url: imageUrl,
      models: 'nudity-2.0,offensive,gore',
      api_user: apiUser,
      api_secret: apiSecret,
    })

    const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`, {
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) return { passed: true }

    const data = await res.json() as {
      status: string
      nudity?: {
        sexual_activity: number
        sexual_display: number
        erotica: number
        very_suggestive: number
        suggestive: number
        none: number
      }
      offensive?: { prob: number }
      gore?: { prob: number }
    }

    if (data.status !== 'success') return { passed: true }

    // Sexual content — hard block on explicit
    const nudity = data.nudity
    if (nudity) {
      if (nudity.sexual_activity > 0.25 || nudity.sexual_display > 0.40) {
        return {
          passed: false,
          flagType: 'SEXUAL',
          confidence: Math.max(nudity.sexual_activity, nudity.sexual_display),
          reason: 'Explicit sexual content detected',
        }
      }
      // Soft flag on suggestive content — FLAGGED not BLOCKED
      if (nudity.erotica > 0.5 || nudity.very_suggestive > 0.65) {
        return {
          passed: false,
          flagType: 'SEXUAL',
          confidence: Math.max(nudity.erotica, nudity.very_suggestive),
          reason: 'Suggestive content detected',
        }
      }
    }

    // Gore / graphic violence
    if (data.gore?.prob && data.gore.prob > 0.7) {
      return {
        passed: false,
        flagType: 'VIOLENCE',
        confidence: data.gore.prob,
        reason: 'Graphic violence/gore detected',
      }
    }

    // Offensive content
    if (data.offensive?.prob && data.offensive.prob > 0.85) {
      return {
        passed: false,
        flagType: 'HATE',
        confidence: data.offensive.prob,
        reason: 'Offensive content detected',
      }
    }

    return { passed: true }
  } catch {
    return { passed: true }
  }
}

// ─── Combined check ───────────────────────────────────────────────────────────

export async function moderateContent(opts: {
  text?: string | null
  imageUrl?: string | null
}): Promise<ModerationResult> {
  // Run text and image checks in parallel
  const [textResult, imageResult] = await Promise.all([
    opts.text ? moderateText(opts.text) : Promise.resolve<ModerationResult>({ passed: true }),
    opts.imageUrl ? moderateImage(opts.imageUrl) : Promise.resolve<ModerationResult>({ passed: true }),
  ])

  if (!textResult.passed) return textResult
  if (!imageResult.passed) return imageResult
  return { passed: true }
}

// ─── Strike system ────────────────────────────────────────────────────────────

const AUTO_BAN_THRESHOLD = 3

/**
 * Record a moderation violation for a user.
 * Increments their contentStrikes counter.
 * If they reach AUTO_BAN_THRESHOLD, auto-bans them.
 * Returns whether the user was auto-banned.
 */
export async function recordViolation(opts: {
  userId: string
  contentType: ContentType
  contentRef?: string
  content?: string
  contentUrl?: string
  flagType: string
  confidence: number
  reason?: string
  action?: 'BLOCKED' | 'FLAGGED'
}): Promise<{ autoBanned: boolean; strikes: number }> {
  const action = opts.action ?? 'BLOCKED'

  // Create moderation log
  await prisma.moderationLog.create({
    data: {
      userId: opts.userId,
      contentType: opts.contentType,
      contentRef: opts.contentRef ?? null,
      content: opts.content?.slice(0, 500) ?? null,
      contentUrl: opts.contentUrl ?? null,
      flagType: opts.flagType,
      confidence: opts.confidence,
      action,
      autoAction: true,
    },
  })

  // Increment strikes — only for definite blocks, not soft flags
  const strikeDelta = action === 'BLOCKED' ? 1 : 0
  const updated = await prisma.user.update({
    where: { id: opts.userId },
    data: { contentStrikes: { increment: strikeDelta } },
    select: { contentStrikes: true },
  })

  const strikes = updated.contentStrikes

  // Auto-ban if threshold reached
  let autoBanned = false
  if (strikes >= AUTO_BAN_THRESHOLD) {
    await prisma.user.update({
      where: { id: opts.userId },
      data: { isBanned: true },
    })
    autoBanned = true
  }

  return { autoBanned, strikes }
}
