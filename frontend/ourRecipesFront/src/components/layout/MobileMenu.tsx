import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/utils/cn'
import { useFont } from '@/context/FontContext'
import { FeatureIndicator } from '@/components/ui/FeatureIndicator'
import { FontSwitcher } from '@/components/FontSwitcher'

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
  canEdit: boolean
  onSync: () => void
  isSyncing: boolean
  onLogout: () => void
}

export function MobileMenu({ 
  isOpen, 
  onClose,
  canEdit,
  onSync,
  isSyncing,
  onLogout
}: MobileMenuProps) {
  const { currentFont, setFont, fonts } = useFont();
  const [isFontSectionOpen, setIsFontSectionOpen] = useState(false);

  const selectedFont = fonts.find(f => f.id === currentFont);

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          'fixed inset-0 bg-black/50 z-40 transition-opacity duration-200',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Menu */}
      <div 
        className={cn(
          'fixed inset-y-0 right-0 w-64 bg-white shadow-lg z-50 transform transition-all duration-200 ease-in-out overflow-hidden',
          isOpen 
            ? 'translate-x-0 opacity-100' 
            : 'translate-x-full opacity-0 pointer-events-none'
        )}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-secondary-100">
            <button 
              onClick={onClose}
              className="mr-auto p-2 text-secondary-600 hover:text-secondary-900 transition-colors duration-200 rounded-full hover:bg-secondary-100"
              aria-label="סגור תפריט"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                strokeWidth={1.5} 
                stroke="currentColor" 
                className="w-6 h-6"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            <nav className="p-4 space-y-2">
              {/* Navigation Links */}
              <Link 
                href="/" 
                className="block text-secondary-600 hover:text-secondary-900 transition-all duration-200 py-2 px-3 rounded-md hover:bg-secondary-50"
                onClick={onClose}
              >
                מתכונים
              </Link>

              <FeatureIndicator
                featureId="places-info"
              >
                <Link
                  href="/places"
                  className="flex items-center px-4 py-2 text-secondary-600 hover:bg-secondary-50"
                  onClick={onClose}
                >
                  מקומות
                </Link>
              </FeatureIndicator>

              <FeatureIndicator
                featureId="menu-planner"
              >
                <Link
                  href="/menus"
                  className="flex items-center px-4 py-2 text-secondary-600 hover:bg-secondary-50"
                  onClick={onClose}
                >
                  תפריטים
                </Link>
              </FeatureIndicator>

              {/* Font Selection */}
              <div className="mt-4 pt-4 border-t border-secondary-100">
                <FeatureIndicator featureId="font-selection">
                  <button
                    onClick={() => setIsFontSectionOpen(!isFontSectionOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 text-secondary-700 hover:bg-secondary-50 rounded-md transition-colors"
                  >
                    <span className="text-sm font-medium">סגנון כתב</span>
                    <svg
                      className={`w-5 h-5 transition-transform duration-200 ${
                        isFontSectionOpen ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </FeatureIndicator>

                {/* Font Options */}
                <div className={`
                  mt-2 transition-all duration-200 overflow-hidden
                  ${isFontSectionOpen ? 'max-h-[60vh] opacity-100' : 'max-h-0 opacity-0'}
                `}>
                  <FontSwitcher 
                    variant="menu" 
                    onSelect={() => setIsFontSectionOpen(false)} 
                  />
                </div>
              </div>

              {/* Admin Section */}
              {canEdit && (
                <div className="mt-4 pt-4 border-t border-secondary-100">
                  <Link 
                    href="/manage" 
                    className="block text-secondary-600 hover:text-secondary-900 transition-all duration-200 py-2 px-3 rounded-md hover:bg-secondary-50"
                    onClick={onClose}
                  >
                    ניהול מתכונים
                  </Link>
                  <button
                    className="w-full text-right text-secondary-600 hover:text-secondary-900 transition-all duration-200 py-2 px-3 rounded-md hover:bg-secondary-50 flex items-center"
                    onClick={() => {
                      onSync();
                      onClose();
                    }}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 ml-2" />
                        מסנכרן...
                      </>
                    ) : (
                      'סנכרן'
                    )}
                  </button>
                </div>
              )}
            </nav>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-secondary-100">
            <button
              className="w-full text-right text-red-600 hover:text-red-700 transition-all duration-200 py-2 px-3 rounded-md hover:bg-red-50"
              onClick={() => {
                onLogout();
                onClose();
              }}
            >
              התנתק
            </button>
          </div>
        </div>
      </div>
    </>
  );
} 