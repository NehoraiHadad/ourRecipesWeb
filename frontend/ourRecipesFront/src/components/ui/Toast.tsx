import { useEffect } from 'react'
import { cn } from '@/utils/cn'

interface ToastProps {
  message: string
  variant?: 'success' | 'error' | 'info' | 'warning'
  duration?: number
  onClose: () => void
}

export function Toast({ 
  message, 
  variant = 'info', 
  duration = 3000, 
  onClose 
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  const variantClasses = {
    success: 'bg-green-50/90 text-green-800 border-green-300 shadow-green-100/50',
    error: 'bg-red-50/90 text-red-800 border-red-300 shadow-red-100/50',
    warning: 'bg-yellow-50/90 text-yellow-800 border-yellow-300 shadow-yellow-100/50',
    info: 'bg-blue-50/90 text-blue-800 border-blue-300 shadow-blue-100/50'
  }

  const variantIconClasses = {
    success: 'text-green-500',
    error: 'text-red-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500'
  }

  return (
    <div 
      className={cn(
        'fixed bottom-4 right-4 max-w-sm rounded-xl border p-4',
        'animate-slide-up backdrop-blur-sm',
        'shadow-lg transition-all duration-300 ease-in-out',
        'hover:translate-y-[-2px] hover:shadow-xl',
        variantClasses[variant]
      )}
      role="alert"
    >
      <div className="flex items-center gap-3">
        <div className={cn("flex-shrink-0", variantIconClasses[variant])}>
          {variant === 'success' && (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          {variant === 'error' && (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )}
          {variant === 'warning' && (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          {variant === 'info' && (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <p className="text-sm font-medium flex-grow">{message}</p>
        <button
          onClick={onClose}
          className={cn(
            "flex-shrink-0 rounded-lg p-1.5 inline-flex transition-colors duration-200",
            "hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-2",
            {
              'focus:ring-green-500': variant === 'success',
              'focus:ring-red-500': variant === 'error',
              'focus:ring-yellow-500': variant === 'warning',
              'focus:ring-blue-500': variant === 'info',
            }
          )}
          aria-label="סגור התראה"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
} 