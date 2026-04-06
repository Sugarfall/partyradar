import * as admin from 'firebase-admin'

const DEV_MODE = !process.env['FIREBASE_PROJECT_ID']

if (!admin.apps.length && !DEV_MODE) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env['FIREBASE_PROJECT_ID'],
      privateKey: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
      clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
    }),
  })
}

// In dev mode, export stubs so the app still starts
export const auth = DEV_MODE ? null as any : admin.auth()
export const messaging = DEV_MODE ? null as any : admin.messaging()
export default admin
