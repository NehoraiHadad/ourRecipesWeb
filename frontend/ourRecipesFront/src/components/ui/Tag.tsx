import { cn } from '@/utils/cn'

export type TagVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'

interface TagProps {
  children: React.ReactNode
  variant?: TagVariant
  className?: string
}

export function Tag({ children, variant = 'default', className }: TagProps) {
  const variantStyles = {
    default: 'bg-secondary-100 text-secondary-700',
    primary: 'bg-primary-100 text-primary-700',
    secondary: 'bg-secondary-100 text-secondary-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700'
  }

  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', 
      variantStyles[variant],
      className
    )}>
      {children}
    </span>
  )
}