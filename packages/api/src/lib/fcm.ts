import { messaging } from './firebase-admin'
import { prisma } from '@partyradar/db'
import type { NotificationType } from '@partyradar/shared'

interface SendNotificationOptions {
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, string>
}

export async function sendNotification(opts: SendNotificationOptions) {
  const { userId, type, title, body, data } = opts

  // Save to DB
  await prisma.notification.create({
    data: { userId, type, title, body, data: data ?? null },
  })

  // Send FCM push if user has a token
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } })
  if (!user?.fcmToken) return

  const notifUrl = data?.eventId ? `/events/${data.eventId}` : '/discover'

  try {
    await messaging.send({
      token: user.fcmToken,
      notification: { title, body },
      data: { ...(data ?? {}), url: notifUrl },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          vibrate: [200, 100, 200],
        },
        fcmOptions: { link: notifUrl },
      },
    })
  } catch {
    // Token invalid — clear it
    await prisma.user.update({ where: { id: userId }, data: { fcmToken: null } })
  }
}

export async function sendNotificationToMany(userIds: string[], opts: Omit<SendNotificationOptions, 'userId'>) {
  await Promise.allSettled(userIds.map((userId) => sendNotification({ ...opts, userId })))
}

/** Haversine distance in miles */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
