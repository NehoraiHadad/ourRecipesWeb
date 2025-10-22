import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import localFont from 'next/font/local'
import { AuthProvider } from '@/context/AuthContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { FontProvider } from '@/context/FontContext'
import { TimerProvider } from '@/context/TimerContext'
import { FeatureAnnouncementProvider } from '@/context/FeatureAnnouncementContext'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { SearchProvider } from '@/contexts/SearchContext'
import { RecipeHistoryProvider } from '@/contexts/RecipeHistoryContext'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew'],
  variable: '--font-heebo',
  display: 'swap'
})

const alemnew = localFont({
  src: '../fonts/Oh_AlemnewEmanuelFeleke-Regular.woff2',
  variable: '--font-alemnew',
  display: 'swap'
})

const amit = localFont({
  src: '../fonts/OhAmitMan-Regular.woff2',
  variable: '--font-amit',
  display: 'swap'
})

const aviya = localFont({
  src: '../fonts/OHAviyaGenut-Regular.woff2',
  variable: '--font-aviya',
  display: 'swap'
})

const omer = localFont({
  src: '../fonts/OHOmerWolf-Regular.woff2',
  variable: '--font-omer',
  display: 'swap'
})

const savyon = localFont({
  src: '../fonts/OHSavyonChenKipper-Regular.woff2',
  variable: '--font-savyon',
  display: 'swap'
})

const shilo = localFont({
  src: '../fonts/OHShiloRauchberger-Regular.woff2',
  variable: '--font-shilo',
  display: 'swap'
})

const shir = localFont({
  src: '../fonts/OhShirChanaGorgi-Regular.woff2',
  variable: '--font-shir',
  display: 'swap'
})

const uriyah = localFont({
  src: '../fonts/OHUriyahMash-Regular.woff2',
  variable: '--font-uriyah',
  display: 'swap'
})

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#22c7a0'
}

export const metadata: Metadata = {
  title: 'Our Recipes',
  description: 'המתכונים המשפחתיים שלנו',
  manifest: '/manifest.json',
  metadataBase: new URL('http://localhost'),
  icons: {
    icon: '/home-image.png',
    apple: '/home-image.png'
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Our Recipes'
  },
  openGraph: {
    title: 'Our Recipes',
    description: 'המתכונים המשפחתיים שלנו',
    images: '/home-image.png'
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl"
      className={`${heebo.variable} ${alemnew.variable} ${amit.variable} ${aviya.variable} ${omer.variable} ${savyon.variable} ${shilo.variable} ${shir.variable} ${uriyah.variable}`}
    >
      <body className="bg-secondary-50 bg-paper text-secondary-900 max-h-screen overflow-hidden">
        <AuthProvider>
          <NotificationProvider>
            <FeatureAnnouncementProvider>
              <FontProvider>
                <TimerProvider>
                  <FavoritesProvider>
                    <RecipeHistoryProvider>
                      <SearchProvider>
                        {children}
                      </SearchProvider>
                    </RecipeHistoryProvider>
                  </FavoritesProvider>
                </TimerProvider>
              </FontProvider>
            </FeatureAnnouncementProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  )
} 