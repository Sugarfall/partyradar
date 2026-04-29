import { redirect } from 'next/navigation'

/** /subscriptions is deprecated — use a server-side redirect so the browser
 *  never renders a blank client component before navigating. This avoids a
 *  flash of empty content and is SEO-friendly (308 Permanent Redirect). */
export default function SubscriptionsPage() {
  redirect('/pricing')
}
