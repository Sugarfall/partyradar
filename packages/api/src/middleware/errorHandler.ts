import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
    public code?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/** Best-effort detection of Stripe's own error classes without importing
 *  the module at runtime — they all expose `.type` starting with
 *  `Stripe...Error` on the err object. */
function stripeErrorInfo(err: unknown): { message: string; code?: string; type?: string } | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { type?: unknown; message?: unknown; code?: unknown; raw?: { message?: unknown } }
  const type = typeof e.type === 'string' ? e.type : null
  if (!type || !type.startsWith('Stripe')) return null
  const msg = typeof e.message === 'string' && e.message
    ? e.message
    : typeof e.raw?.message === 'string' ? e.raw.message : 'Payment provider error'
  const code = typeof e.code === 'string' ? e.code : undefined
  return { message: msg, code, type }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code })
    return
  }

  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => {
      const path = e.path.join('.')
      return path ? `${path}: ${e.message}` : e.message
    })
    res.status(400).json({ error: 'Validation failed', details: messages })
    return
  }

  // Surface Stripe errors to the client with their real message — a
  // generic "Internal server error" makes wallet/top-up/subscribe bugs
  // un-diagnosable for the user.
  const stripe = stripeErrorInfo(err)
  if (stripe) {
    console.error('[Stripe Error]', req.method, req.path, stripe.type, stripe.code, stripe.message)
    // Auth errors mean the server is mis-configured — tell the user it's
    // a platform issue rather than their fault.
    if (stripe.type === 'StripeAuthenticationError' || stripe.type === 'StripePermissionError') {
      res.status(503).json({ error: 'Payments are temporarily unavailable. Please try again later.', code: stripe.code })
      return
    }
    // Card errors are user-actionable (declined, incorrect cvc, etc.)
    if (stripe.type === 'StripeCardError') {
      res.status(402).json({ error: stripe.message, code: stripe.code })
      return
    }
    // Everything else (invalid request, rate-limit, api error)
    res.status(502).json({ error: stripe.message, code: stripe.code })
    return
  }

  console.error('[Error]', req.method, req.path, err)
  res.status(500).json({ error: 'Internal server error' })
}
