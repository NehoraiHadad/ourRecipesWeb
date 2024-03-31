import { Heebo } from 'next/font/google'
 
export const heebo_init = Heebo({
  subsets: ['latin'],
  display: 'swap',
  variable: "--font-heebo"
})

export const heebo = heebo_init.variable