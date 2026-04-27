import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that require authentication. The `pr_auth` cookie is set by
// useAuth after a successful /auth/sync, and cleared on logout.
// This is a fast edge check so unauthenticated visitors get an immediate
// redirect instead of a flash of protected UI before the client-side
// auth check fires. It is NOT a security boundary — the real enforcement
// is in the API layer (requireAuth, requireAdmin, requireTier).

const PROTECTED_PATHS = [
  '/admin',
  '/dashboard',
  '/host',
  '/payouts',
  '/wallet',
  '/settings',
  '/notifications',
  '/messages',
  '/events/create',
  '/profile/edit',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  if (!isProtected) return NextResponse.next()

  // Check presence cookie (set by useAuth after successful sync)
  const isLoggedIn = request.cookies.has('pr_auth')

  if (!isLoggedIn) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|images|fonts|api).*)',
  ],
}
