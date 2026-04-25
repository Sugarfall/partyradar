import * as admin from 'firebase-admin'

const projectId    = process.env['FIREBASE_PROJECT_ID']
const privateKey   = process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n')
const clientEmail  = process.env['FIREBASE_CLIENT_EMAIL']

const hasCredentials = !!(projectId && privateKey && clientEmail)

if (!hasCredentials) {
  // C6 fix: log a clear diagnostic instead of silently exporting null (which
  // causes a cryptic TypeError at call-time). We intentionally do NOT throw at
  // module level — a module-level throw would propagate through every route
  // import and crash the entire server, taking down venues/feed/events along
  // with auth. Log loudly instead so the misconfiguration is visible in Railway
  // logs while the rest of the API stays alive.
  const missing = [
    !projectId    && 'FIREBASE_PROJECT_ID',
    !privateKey   && 'FIREBASE_PRIVATE_KEY',
    !clientEmail  && 'FIREBASE_CLIENT_EMAIL',
  ].filter(Boolean).join(', ')
  console.error(
    `[Firebase] Missing credentials (${missing}) — running in stub mode. ` +
    'All auth endpoints will return 401. Set the missing env vars to enable authentication.'
  )
}

if (hasCredentials && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, privateKey, clientEmail }),
  })
}

/** Stub that throws a clear "not configured" error instead of a cryptic TypeError. */
function makeStub(name: string): any {
  return new Proxy({}, {
    get: (_target, prop) => {
      return () => {
        throw new Error(
          `[Firebase] ${name}.${String(prop)}() called but Firebase is not configured. ` +
          'Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL.'
        )
      }
    },
  })
}

export const auth      = hasCredentials ? admin.auth()      : makeStub('auth')
export const messaging = hasCredentials ? admin.messaging() : makeStub('messaging')
export default admin
