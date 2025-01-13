import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import localFont from 'next/font/local'
import { AuthProvider } from '@/context/AuthContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { FontProvider } from '@/context/FontContext'
import { TimerProvider } from '@/context/TimerContext'
import './globals.css'

const heebo = Heebo({ 
  subsets: ['hebrew'],
  variable: '--font-heebo'
})

const alemnew = localFont({
  src: '../fonts/Oh_AlemnewEmanuelFeleke-Regular.woff2',
  variable: '--font-alemnew'
})

const amit = localFont({
  src: '../fonts/OhAmitMan-Regular.woff2',
  variable: '--font-amit'
})

const aviya = localFont({
  src: '../fonts/OHAviyaGenut-Regular.woff2',
  variable: '--font-aviya'
})

const omer = localFont({
  src: '../fonts/OHOmerWolf-Regular.woff2',
  variable: '--font-omer'
})

const savyon = localFont({
  src: '../fonts/OHSavyonChenKipper-Regular.woff2',
  variable: '--font-savyon'
})

const shilo = localFont({
  src: '../fonts/OHShiloRauchberger-Regular.woff2',
  variable: '--font-shilo'
})

const shir = localFont({
  src: '../fonts/OhShirChanaGorgi-Regular.woff2',
  variable: '--font-shir'
})

const uriyah = localFont({
  src: '../fonts/OHUriyahMash-Regular.woff2',
  variable: '--font-uriyah'
})

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1
}

export const metadata: Metadata = {
  title: 'Our Recipes',
  description: 'המתכונים המשפחתיים שלנו',
  icons: {
    icon: '/home-image.png',
    apple: '/home-image.png'
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
      className={`
        ${heebo.variable} 
        ${savyon.variable}
        ${alemnew.variable}
        ${amit.variable}
        ${aviya.variable}
        ${omer.variable}
        ${shilo.variable}
        ${shir.variable}
        ${uriyah.variable}
      `}
    >
      <body className="bg-secondary-50 bg-paper text-secondary-900 max-h-screen overflow-hidden">
        <AuthProvider>
          <NotificationProvider>
            <FontProvider>
              <TimerProvider>
                {children}
              </TimerProvider>
            </FontProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  )
} 