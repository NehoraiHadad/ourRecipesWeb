import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import { AuthProvider } from '@/context/AuthContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { FontProvider } from '@/context/FontContext'
import { TimerProvider } from '@/context/TimerContext'
import { FeatureAnnouncementProvider } from '@/context/FeatureAnnouncementContext'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { SearchProvider } from '@/contexts/SearchContext'
import { RecipeHistoryProvider } from '@/contexts/RecipeHistoryContext'
import './globals.css'

// Only load default font - others will be loaded dynamically
const heebo = Heebo({
  subsets: ['hebrew'],
  variable: '--font-heebo',
  display: 'swap', // Show text immediately with fallback
  preload: true
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
      className={heebo.variable}
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