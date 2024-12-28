'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type FontFamily = 'heebo' | 'alemnew' | 'amit' | 'aviya' | 'omer' | 'savyon' | 'shilo' | 'shir' | 'uriyah';

interface FontContextType {
  currentFont: FontFamily
  setFont: (font: FontFamily) => void
  fonts: Array<{ id: FontFamily; name: string; description: string }>
}

const FontContext = createContext<FontContextType | undefined>(undefined)

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [currentFont, setCurrentFont] = useState<FontFamily>('heebo')

  const fonts = [
    { id: 'heebo', name: 'HEBBO', description: 'פונט ברירת מחדל' },
    { id: 'alemnew', name: 'אלמנו פלקה', description: 'כתב יד מסורתי' },
    { id: 'amit', name: 'עמית מן', description: 'כתב יד מודרני' },
    { id: 'aviya', name: 'אביה גנות', description: 'כתב יד אלגנטי' },
    { id: 'omer', name: 'עומר וולף', description: 'כתב יד קליל' },
    { id: 'savyon', name: 'סביון חן קיפר', description: 'כתב יד עגול' },
    { id: 'shilo', name: 'שילה ראוכברגר', description: 'כתב יד קלאסי' },
    { id: 'shir', name: 'שיר חנה גורגי', description: 'כתב יד נשי' },
    { id: 'uriyah', name: 'אוריה מש', description: 'כתב יד מסורתי' }
  ] as const

  useEffect(() => {
    // Update CSS variable when font changes
    document.documentElement.style.setProperty(
      '--current-font',
      `var(--font-${currentFont})`
    )
  }, [currentFont])

  const setFont = (font: FontFamily) => {
    setCurrentFont(font)
    localStorage.setItem('preferred-font', font)
  }

  // Load preferred font on mount
  useEffect(() => {
    const savedFont = localStorage.getItem('preferred-font') as FontFamily
    if (savedFont && fonts.some(f => f.id === savedFont)) {
      setCurrentFont(savedFont)
    }
  }, [])

  return (
    <FontContext.Provider value={{ currentFont, setFont, fonts }}>
      {children}
    </FontContext.Provider>
  )
}

export function useFont() {
  const context = useContext(FontContext)
  if (!context) throw new Error('useFont must be used within FontProvider')
  return context
} 