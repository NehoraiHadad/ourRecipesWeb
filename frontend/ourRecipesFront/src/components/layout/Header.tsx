'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Container } from '@/components/ui/Container'
import { Button } from '@/components/ui/Button'
import { MobileMenu } from './MobileMenu'
import { useAuthContext } from '@/context/AuthContext'
import Logo from '../Logo'
import { FeatureIndicator } from '@/components/ui/FeatureIndicator'
import { FontSwitcher } from '@/components/FontSwitcher'
import { useSearchContext } from '@/contexts/SearchContext'
import { authService } from '@/services/authService'
import { SyncService } from '@/services/syncService'

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const router = useRouter()
  const { setAuthState, authState } = useAuthContext()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { clearSearch } = useSearchContext()
  const userMenuRef = useRef<HTMLDivElement>(null)

  const handleLogout = async () => {
    try {
      console.group('Logout Process');
      console.log('Starting logout...');
      console.log('Current guest token:', localStorage.getItem('guest_token'));
      
      await authService.logout();

      setAuthState({
        isAuthenticated: false,
        canEdit: false,
        isLoading: false,
        error: null,
        user: null
      });

      clearSearch();
      router.push('/login');
      console.groupEnd();
    } catch (error) {
      console.error('Logout failed:', error);
      console.groupEnd();
    }
  };

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await SyncService.startSync();
      //TODO: Add a notification here for the user about the sync results
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault()
    clearSearch()
    router.push('/')
  }

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserMenu])

  return (
    <header className="bg-white border-b border-secondary-200 sticky top-0 z-30 w-full">
      <Container>
        <div className="flex items-center justify-between h-16 px-4 sm:px-0">
          {/* Logo & Brand */}
          <div onClick={handleLogoClick} className="flex items-center cursor-pointer">
            <Logo />
          </div>

          {/* Main Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className="text-secondary-600 hover:text-secondary-900 transition-colors">
              מתכונים
            </Link>
            <FeatureIndicator
              featureId="places-info"
            >
              <Link href="/places" className="text-secondary-600 hover:text-secondary-900">
                מקומות
              </Link>
            </FeatureIndicator>
            <FeatureIndicator
              featureId="menu-planner"
            >
              <Link href="/menus" className="text-secondary-600 hover:text-secondary-900">
                תפריטים
              </Link>
            </FeatureIndicator>
            {authState.canEdit && (
              <Link href="/manage" className="text-secondary-600 hover:text-secondary-900 transition-colors">
                ניהול מתכונים
              </Link>
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            {/* Font Switcher */}
            <div className="hidden md:block">
              <FeatureIndicator featureId="font-selection">
                <FontSwitcher />
              </FeatureIndicator>
            </div>

            {/* User Menu for Desktop */}
            {authState.isAuthenticated ? (
              <div ref={userMenuRef} className="relative hidden md:block">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="p-2 text-secondary-600 hover:text-secondary-900 transition-colors rounded-full hover:bg-secondary-50"
                  aria-label="תפריט משתמש"
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
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                    />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showUserMenu && (
                  <div className="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-secondary-200 py-2 z-50">
                    {authState.user && (
                      <div className="px-4 py-2 border-b border-secondary-200">
                        <p className="text-sm font-medium text-secondary-900">{authState.user.name}</p>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        handleLogout()
                        setShowUserMenu(false)
                      }}
                      className="w-full text-right px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      התנתק
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden md:block"
              >
                <Button variant="primary" size="sm">
                  התחבר
                </Button>
              </Link>
            )}

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