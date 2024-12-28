import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  required?: boolean
  helperText?: string
  startIcon?: React.ReactNode
  endIcon?: React.ReactNode
  variant?: 'default' | 'search' | 'number'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  className,
  label,
  error,
  required,
  helperText,
  id,
  startIcon,
  endIcon,
  variant = 'default',
  type = 'text',
  ...props
}, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm font-medium text-secondary-700 mb-1"
        >
          {label}
          {required && <span className="text-error-500 mr-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {startIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-500">
            {startIcon}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            'w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-secondary-900',
            'placeholder:text-secondary-400',
            'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            'disabled:bg-secondary-50 disabled:text-secondary-500',
            startIcon && 'pr-10',
            endIcon && 'pl-10',
            error && 'border-error-500 focus:border-error-500 focus:ring-error-500/20',
            variant === 'search' && 'bg-secondary-50',
            variant === 'number' && 'text-center',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            error ? `${inputId}-error` : 
            helperText ? `${inputId}-helper` : 
            undefined
          }
          {...props}
        />

        {endIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500">
            {endIcon}
          </div>
        )}
      </div>

      {error && (
        <p 
          id={`${inputId}-error`}
          className="mt-1 text-sm text-error-500"
        >
          {error}
        </p>
      )}

      {!error && helperText && (
        <p 
          id={`${inputId}-helper`}
          className="mt-1 text-sm text-secondary-500"
        >
          {helperText}
        </p>
      )}
    </div>
  )
})

Input.displayName = 'Input' 