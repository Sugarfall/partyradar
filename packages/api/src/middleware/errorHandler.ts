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

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
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

  console.error('[Error]', err)
  res.status(500).json({ error: 'Internal server error' })
}
