/**
 * Centralised client-side error surfacing.
 *
 * Many fire-and-forget calls across the app use `.catch(() => {})` to avoid
 * triggering React error boundaries for non-critical requests (impression
 * tracking, background refreshes, etc). That silences real bugs too.
 *
 * Use `logError(context, err)` instead: visible in dev, routable to a
 * tracker (Sentry/Datadog) in prod by wiring a single hook here.
 */

type ErrorReporter = (context: string, err: unknown) => void

let reporter: ErrorReporter | null = null

export function setErrorReporter(fn: ErrorReporter): void {
  reporter = fn
}

export function logError(context: string, err: unknown): void {
  // Dev: always log so real bugs surface during development.
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(`[${context}]`, err)
  }
  if (reporter) {
    try { reporter(context, err) } catch { /* reporter itself must not throw */ }
  }
}

/** Convenience: `.catch(silent('context'))` replaces `.catch(() => {})` */
export function silent(context: string): (err: unknown) => void {
  return (err: unknown) => logError(context, err)
}
