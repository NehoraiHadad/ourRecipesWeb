import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/utils/cn'
import { LoadingSpinner } from './LoadingSpinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  ...props
}, ref) => {
  const baseStyles = cn(
    'relative inline-flex items-center justify-center font-medium transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-100',
    'disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]',
    {
      // Primary variant
      'bg-primary-500 text-white shadow-warm hover:bg-primary-600 hover:shadow-warm-lg': variant === 'primary',
      // Secondary variant
      'bg-white text-secondary-700 border border-secondary-200 shadow-warm hover:bg-secondary-50 hover:border-secondary-300 hover:shadow-warm-lg': variant === 'secondary',
      // Ghost variant
      'bg-transparent hover:bg-secondary-50 text-secondary-600 hover:text-secondary-900': variant === 'ghost',
      // Sizes
      'text-sm rounded-lg px-3 py-1.5 gap-1.5': size === 'sm',
      'rounded-lg px-4 py-2 gap-2': size === 'md',
      'text-lg rounded-xl px-6 py-3 gap-2.5': size === 'lg',
      // Loading state
      'relative !text-transparent transition-none hover:!text-transparent': isLoading,
    },
    className
  )

  return (
    <button
      ref={ref}
      className={baseStyles}
      disabled={disabled || isLoading}
      {...props}
    >
      {children}
      {isLoading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <LoadingSpinner 
            size={size === 'lg' ? 'md' : 'sm'}
            className={cn(
              'border-current',
              {
                'border-white': variant === 'primary',
                'border-secondary-600': variant === 'secondary' || variant === 'ghost',
              }
            )}
          />
        </div>
      )}
    </button>
  )
})

Button.displayName = 'Button'

export { Button }