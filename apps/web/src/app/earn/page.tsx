import { redirect } from 'next/navigation'

/** /earn has been merged into /referrals (HOW TO EARN tab). */
export default function EarnRedirect() {
  redirect('/referrals')
}
