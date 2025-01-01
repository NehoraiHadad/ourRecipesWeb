'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Container } from '@/components/ui/Container'
import { Button } from '@/components/ui/Button'
import { MobileMenu } from './MobileMenu'
import { useAuthContext } from '@/context/AuthContext'
import Logo from '../Logo'
import { useFont } from '@/context/FontContext'

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const router = useRouter()
  const { setAuthState, authState } = useAuthContext()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { currentFont, setFont, fonts } = useFont()

  const handleLogout = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error("Logout failed")
      }

      setAuthState({
        isAuthenticated: false,
        canEdit: false,
        isLoading: true,
        error: response.statusText,
        user: null
      })

      router.push("/login")
    } catch (error) {
      console.error("Error logging out:", error)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sync`, {
        method: 'POST',
        credentials: 'include'
      })
      
      if (!response.ok) throw new Error('Sync failed')
      
      const data = await response.json()
      console.log('Sync results:', data)
      //TODO: Add a notification here for the user about the sync results
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <header className="bg-white border-b border-secondary-200 sticky top-0 z-30 w-full">
      <Container>
        <div className="flex items-center justify-between h-16 px-4 sm:px-0">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>

          {/* Main Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className="text-secondary-600 hover:text-secondary-900 transition-colors">
              בית
            </Link>
            <Link href="/places" className="text-secondary-600 hover:text-secondary-900">
              המלצות
            </Link>
            {authState.canEdit && (
              <Link href="/manage" className="text-secondary-600 hover:text-secondary-900 transition-colors">
                ניהול מתכונים
              </Link>
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            {/* User Menu */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg hover:bg-secondary-50 
                         text-secondary-700 transition-colors"
              >
                <span className="hidden sm:inline">העדפות</span>
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-secondary-200 py-2 z-50">
                  {/* Font Selection */}
                  <div className="px-4 py-2">
                    <h3 className="text-sm font-medium text-secondary-700 mb-2">סגנון כתב:</h3>
                    <div className="space-y-1">
                      {fonts.map((font) => (
                        <button
                          key={font.id}
                          onClick={() => {
                            setFont(font.id);
                            setShowUserMenu(false);
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

                  <div className="border-t border-secondary-200 mt-2 pt-2">
                    <button
                      onClick={handleLogout}
                      className="w-full text-right px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      התנתק
                    </button>
                  </div>
                </div>
              )}
            </div>

            {authState.canEdit && (
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={handleSync} 
                disabled={isSyncing}
                className="hidden sm:flex"
              >
                {isSyncing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 ml-2"></div>
                    מסנכרן...
                  </>
                ) : (
                  'סנכרן'
                )}
              </Button>
            )}
            
            {/* GitHub Link */}
            <a
              href="https://github.com/NehoraiHadad/ourRecipesWeb"
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary-600 hover:text-secondary-900 hidden sm:block"
              aria-label="Link to GitHub Page"
            >
              <svg
                viewBox="-2.4 -2.4 28.80 28.80"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6"
              >
                <path
                  d="M16 22.0268V19.1568C16.0375 18.68 15.9731 18.2006 15.811 17.7506C15.6489 17.3006 15.3929 16.8902 15.06 16.5468C18.2 16.1968 21.5 15.0068 21.5 9.54679C21.4997 8.15062 20.9627 6.80799 20 5.79679C20.4558 4.5753 20.4236 3.22514 19.91 2.02679C19.91 2.02679 18.73 1.67679 16 3.50679C13.708 2.88561 11.292 2.88561 8.99999 3.50679C6.26999 1.67679 5.08999 2.02679 5.08999 2.02679C4.57636 3.22514 4.54413 4.5753 4.99999 5.79679C4.03011 6.81549 3.49251 8.17026 3.49999 9.57679C3.49999 14.9968 6.79998 16.1868 9.93998 16.5768C9.61098 16.9168 9.35725 17.3222 9.19529 17.7667C9.03334 18.2112 8.96679 18.6849 8.99999 19.1568V22.0268"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  stroke="currentColor"
                />
                <path
                  d="M9 20.0267C6 20.9999 3.5 20.0267 2 17.0267"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  stroke="currentColor"
                />
              </svg>
            </a>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2 text-secondary-600 hover:text-secondary-900"
              aria-label="תפריט"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                strokeWidth={1.5} 
                stroke="currentColor" 
                className="w-6 h-6"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" 
                />
              </svg>
            </button>
          </div>
        </div>
      </Container>

      {/* Mobile Menu */}
      <MobileMenu 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)}
        canEdit={authState.canEdit}
        onSync={handleSync}
        isSyncing={isSyncing}
        onLogout={handleLogout}
      />
    </header>
  )
}