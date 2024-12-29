import { useState } from 'react'
import { cn } from '@/utils/cn'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export function Tooltip({ 
  content, 
  children, 
  position = 'top',
  className 
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 ml-2',
    right: 'left-full top-1/2 -translate-y-1/2 mr-2'
  }

  return (
    <div 
      className="group relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div 
          role="tooltip"
          className={cn(
            'absolute z-50 px-2 py-1 text-sm text-white bg-secondary-900 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300',
            positionClasses[position],
            className
          )}
        >
          {content}
          <div 
            className={cn(
              'absolute -bottom-1 left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-secondary-900',
              {
                'bottom-[-4px] left-1/2 -translate-x-1/2': position === 'top',
                'top-[-4px] left-1/2 -translate-x-1/2': position === 'bottom',
                'right-[-4px] top-1/2 -translate-y-1/2': position === 'left',
                'left-[-4px] top-1/2 -translate-y-1/2': position === 'right',
              }
            )}
          />
        </div>
      )}
    </div>
  )
} 