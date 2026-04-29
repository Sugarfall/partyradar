import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { SpeedInsights } from '@vercel/speed-insights/next'
import '@/styles/globals.css'
import { AuthProvider } from '@/hooks/useAuth'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { CurrencyProvider } from '@/contexts/CurrencyContext'
import { UserLocationProvider } from '@/contexts/UserLocationContext'
import Navbar from '@/components/layout/Navbar'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import VenueAutoDiscover from '@/components/layout/VenueAutoDiscover'
import ReferralCapture from '@/components/layout/ReferralCapture'
import { ToastHost } from '@/components/ui/Toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'PartyRadar — Find Your Night',
    template: '%s · PartyRadar',
  },
  description: 'Discover home parties, club nights, concerts, and celebrity sightings near you.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PartyRadar',
  },
  icons: {
    apple: '/icons/icon-152.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'PartyRadar',
    title: 'PartyRadar — Find Your Night',
    description: 'Discover home parties, club nights, concerts, and celebrity sightings near you.',
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'PartyRadar' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PartyRadar — Find Your Night',
    description: 'Discover home parties, club nights, concerts, and celebrity sightings near you.',
    images: ['/icons/icon-512.png'],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: 'var(--accent)',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
      </head>
      <body className={`${inter.className} bg-bg-primary text-white min-h-screen`}>
        <AuthProvider>
          <UserLocationProvider>
          <CurrencyProvider>
          <LanguageProvider>
            <ToastHost>
              <ThemeProvider />
              <Navbar />
              <VenueAutoDiscover />
              <ReferralCapture />
              <main className="pt-14 min-h-screen">{children}</main>
              <PWAInstallPrompt />
              <SpeedInsights />
            </ToastHost>
          </LanguageProvider>
          </CurrencyProvider>
          </UserLocationProvider>
        </AuthProvider>

        {/* Register service worker */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {})
            })
          }
        `}</Script>
      </body>
    </html>
  )
}
