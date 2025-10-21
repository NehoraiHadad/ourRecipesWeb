'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

type FontFamily = 'heebo' | 'alemnew' | 'amit' | 'aviya' | 'omer' | 'savyon' | 'shilo' | 'shir' | 'uriyah';

interface FontContextType {
  currentFont: FontFamily
  setFont: (font: FontFamily) => void
  fonts: Array<{ id: FontFamily; name: string; description: string }>
  isLoading: boolean
}

// Font file paths
const FONT_PATHS: Record<Exclude<FontFamily, 'heebo'>, string> = {
  alemnew: '/fonts/Oh_AlemnewEmanuelFeleke-Regular.woff2',
  amit: '/fonts/OhAmitMan-Regular.woff2',
  aviya: '/fonts/OHAviyaGenut-Regular.woff2',
  omer: '/fonts/OHOmerWolf-Regular.woff2',
  savyon: '/fonts/OHSavyonChenKipper-Regular.woff2',
  shilo: '/fonts/OHShiloRauchberger-Regular.woff2',
  shir: '/fonts/OhShirChanaGorgi-Regular.woff2',
  uriyah: '/fonts/OHUriyahMash-Regular.woff2'
}

const FontContext = createContext<FontContextType | undefined>(undefined)

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [currentFont, setCurrentFont] = useState<FontFamily>('heebo')
  const [loadedFonts, setLoadedFonts] = useState<Set<FontFamily>>(new Set(['heebo'])) // heebo is already loaded
  const [isLoading, setIsLoading] = useState(false)

  const fonts: Array<{ id: FontFamily; name: string; description: string }> = [
    { id: 'heebo', name: 'HEBBO', description: 'פונט ברירת מחדל' },
    { id: 'alemnew', name: 'אלמנו פלקה', description: 'כתב יד מסורתי' },
    { id: 'amit', name: 'עמית מן', description: 'כתב יד מודרני' },
    { id: 'aviya', name: 'אביה גנות', description: 'כתב יד אלגנטי' },
    { id: 'omer', name: 'עומר וולף', description: 'כתב יד קליל' },
    { id: 'savyon', name: 'סביון חן קיפר', description: 'כתב יד עגול' },
    { id: 'shilo', name: 'שילה ראוכברגר', description: 'כתב יד קלאסי' },
    { id: 'shir', name: 'שיר חנה גורגי', description: 'כתב יד נשי' },
    { id: 'uriyah', name: 'אוריה מש', description: 'כתב יד מסורתי' }
  ]

  // Dynamically load a font
  const loadFont = useCallback(async (fontId: FontFamily) => {
    if (fontId === 'heebo' || loadedFonts.has(fontId)) {
      return; // Already loaded
    }

    try {
      setIsLoading(true);
      const fontPath = FONT_PATHS[fontId as Exclude<FontFamily, 'heebo'>];

      // Create @font-face rule dynamically
      const fontFace = new FontFace(
        `font-${fontId}`,
        `url(${fontPath}) format('woff2')`,
        {
          display: 'swap', // Show text immediately with fallback
          style: 'normal',
          weight: '400'
        }
      );

      // Load the font
      await fontFace.load();

      // Add to document fonts
      document.fonts.add(fontFace);

      // Inject CSS variable
      const style = document.createElement('style');
      style.textContent = `
        :root {
          --font-${fontId}: font-${fontId}, var(--font-heebo), system-ui, -apple-system, sans-serif;
        }
      `;
      document.head.appendChild(style);

      // Mark as loaded
      setLoadedFonts(prev => new Set([...prev, fontId]));
    } catch (error) {
      console.error(`Failed to load font: ${fontId}`, error);
    } finally {
      setIsLoading(false);
    }
  }, [loadedFonts]);

  useEffect(() => {
    // Update CSS variable when font changes
    document.documentElement.style.setProperty(
      '--current-font',
      `var(--font-${currentFont})`
    )
  }, [currentFont])

  const setFont = useCallback(async (font: FontFamily) => {
    // Load font if not already loaded
    if (!loadedFonts.has(font)) {
      await loadFont(font);
    }

    setCurrentFont(font)
    localStorage.setItem('preferred-font', font)
  }, [loadedFonts, loadFont])

  // Load preferred font on mount
  useEffect(() => {
    const savedFont = localStorage.getItem('preferred-font') as FontFamily
    if (savedFont && fonts.some(f => f.id === savedFont)) {
      // Preload saved font for faster subsequent page loads
      setFont(savedFont)
    }
  }, [])

  return (
    <FontContext.Provider value={{ currentFont, setFont, fonts, isLoading }}>
      {children}
    </FontContext.Provider>
  )
}

export function useFont() {
  const context = useContext(FontContext)
  if (!context) throw new Error('useFont must be used within FontProvider')
  return context
} 