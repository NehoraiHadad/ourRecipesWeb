import { cn } from '@/utils/cn'

interface TypographyProps {
  children: React.ReactNode
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'body'
  className?: string
}

export function Typography({ children, variant = 'body', className }: TypographyProps) {
  const styles = {
    h1: 'text-2xl font-bold',
    h2: 'text-xl font-semibold',
    h3: 'text-lg font-medium',
    h4: 'text-base font-medium',
    body: 'text-base'
  }

  return (
    <div className={cn(styles[variant], className)}>
      {children}
    </div>
  )
}