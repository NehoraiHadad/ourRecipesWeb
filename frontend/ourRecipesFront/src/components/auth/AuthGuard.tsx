import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Spinner from '@/components/ui/Spinner'
import { useNotification } from '@/context/NotificationContext'

interface AuthGuardProps {
  children: React.ReactNode
  requiresEdit?: boolean
  redirectTo?: string
}

export function AuthGuard({ children, requiresEdit = false, redirectTo = '/login' }: AuthGuardProps) {
  const router = useRouter()
  const { isAuthenticated, canEdit, isLoading, error } = useAuth(redirectTo, false)
  const { addNotification } = useNotification()
  
  useEffect(() => {
    let timeout: NodeJS.Timeout
    
    if (!isLoading && !isAuthenticated) {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/login-error') {
        sessionStorage.setItem('returnTo', currentPath);
      }
      
      timeout = setTimeout(() => {
        router.push(redirectTo)
      }, 2000)
    }
    
    return () => clearTimeout(timeout)
  }, [isLoading, isAuthenticated, redirectTo, router])

  useEffect(() => {
    if (error) {
      addNotification({
        message: error,
        type: 'error',
        duration: 5000
      })
    }
  }, [error, addNotification])

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Spinner size='lg' />
        <p className="text-secondary-600">מאמת הרשאות...</p>
      </div>
    )
  }

  if (!isAuthenticated || (requiresEdit && !canEdit)) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Spinner size='lg' />
        <p className="text-secondary-600">מעביר לדף ההתחברות...</p>
      </div>
    )
  }

  return <>{children}</>
} 