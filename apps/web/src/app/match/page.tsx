import { redirect } from 'next/navigation'

/**
 * The /match route was consolidated into /nearby. Redirect permanently so
 * any bookmarked URLs (and the old login?next=/match deep link) still land
 * on the live feature.
 */
export default function MatchRedirectPage() {
  redirect('/nearby')
}
