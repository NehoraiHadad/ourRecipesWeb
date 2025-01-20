import { useFont } from '@/context/FontContext';
import { useState } from 'react';

export function FontSwitcher() {
  const { currentFont, setFont, fonts } = useFont();
  const [isOpen, setIsOpen] = useState(false);

  const selectedFont = fonts.find(f => f.id === currentFont);

  return (
    <div className="fixed top-4 left-4 z-50">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white/95 backdrop-blur-sm rounded-lg 
                 shadow-warm border border-secondary-200 text-secondary-700 hover:bg-secondary-50
                 transition-all duration-200"
      >
        <span style={{ fontFamily: `var(--font-${currentFont})` }} className="text-base">
          {selectedFont?.name}
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Fonts Menu */}
      {isOpen && (
        <div className="absolute top-12 left-0 w-64 bg-white/95 backdrop-blur-sm rounded-lg 
                      shadow-warm p-3 space-y-2 border border-secondary-200">
          <h3 className="text-sm font-medium text-secondary-700 mb-2">בחר סגנון כתב:</h3>
          <div className="space-y-1">
            {fonts.map((font) => (
              <button
                key={font.id}
                onClick={() => {
                  setFont(font.id);
                  setIsOpen(false);
                }}
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
      )}
    </div>
  );
} 