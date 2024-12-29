import { cn } from '@/utils/cn'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  message?: string
}

export function LoadingSpinner({ size = 'md', className, message }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }

  return (
    <div className="flex items-center justify-center space-x-2 rtl:space-x-reverse">
      <div 
        className={cn(
          'animate-spin rounded-full border-b-2 border-current',
          sizeClasses[size],
          className
        )}
      />
      {message && (
        <span className="text-sm text-secondary-600">{message}</span>
      )}
    </div>
  )
} 