import { redirect } from 'next/navigation'

// Radar feature has been removed. Redirect to Discover.
export default function RadarPage() {
  redirect('/discover')
}
