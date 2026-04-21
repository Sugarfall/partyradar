/**
 * Build a /login URL that will return the user to their current page after
 * signing in. The login page reads `?next=` and routes there on success.
 *
 * Pass an explicit `from` path (e.g. from `usePathname()`) when you have it —
 * otherwise we fall back to `window.location.pathname` + search.
 */
export function loginHref(from?: string): string {
  const target =
    from ??
    (typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '/')
  // Avoid redirecting back to auth pages (would cause a loop)
  if (target.startsWith('/login') || target.startsWith('/register') || target.startsWith('/invite')) {
    return '/login'
  }
  return `/login?next=${encodeURIComponent(target)}`
}
