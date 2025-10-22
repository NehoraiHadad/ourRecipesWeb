import { useFont } from '@/context/FontContext';
import { useState } from 'react';

interface FontSwitcherProps {
  variant?: 'dropdown' | 'menu';
  onSelect?: () => void;
}

export function FontSwitcher({ variant = 'dropdown', onSelect }: FontSwitcherProps) {
  const { currentFont, setFont, fonts } = useFont();
  const [isOpen, setIsOpen] = useState(false);

  const selectedFont = fonts.find(f => f.id === currentFont);

  const handleFontSelect = (fontId: typeof currentFont) => {
    setFont(fontId);
    setIsOpen(false);
    onSelect?.();
  };

  if (variant === 'menu') {
    return (
      <div className="px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-secondary-700">סגנון כתב:</h3>
        </div>
        <div className="space-y-1">
          {fonts.map((font) => (
            <button
              key={font.id}
              onClick={() => handleFontSelect(font.id)}
              className={`
                w-full text-right px-3 py-2 rounded-md text-sm
                transition-all duration-200
                ${currentFont === font.id
                  ? 'bg-primary-50 text-primary-700'
                  : 'hover:bg-secondary-50 text-secondary-600'
                }
              `}
              style={{ fontFamily: `var(--font-${font.id})` }}
            >
              <div className="text-base">{font.name}</div>
              <div className="text-xs opacity-75">{font.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg hover:bg-secondary-50 
                  text-secondary-700 transition-colors"
      >
        <span className="hidden sm:inline">העדפות</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-secondary-200 py-2 z-50">
          <div className="px-4 py-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-secondary-700">סגנון כתב:</h3>
            </div>
            <div className="space-y-1">
              {fonts.map((font) => (
                <button
                  key={font.id}
                  onClick={() => handleFontSelect(font.id)}
                  className={`
                    w-full text-right px-3 py-2 rounded-md text-sm
                    transition-all duration-200
                    ${currentFont === font.id
                      ? 'bg-primary-50 text-primary-700'
                      : 'hover:bg-secondary-50 text-secondary-600'
                    }
                  `}
                  style={{ fontFamily: `var(--font-${font.id})` }}
                >
                  <div className="text-base">{font.name}</div>
                  <div className="text-xs opacity-75">{font.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 