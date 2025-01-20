import useEscapeKey from "../hooks/useEscapeKey";
import { useRef, useState, useEffect } from "react";
import { useFont } from '@/context/FontContext';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string | React.ReactNode;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  className?: string;
  contentClassName?: string;
  footer?: React.ReactNode;
  closeOnOutsideClick?: boolean;
}

const ANIMATION_DURATION = 10;

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  children,
  title,
  description,
  size = 'md',
  showCloseButton = true,
  className,
  contentClassName,
  footer,
  closeOnOutsideClick = true,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { currentFont } = useFont();
  const [isClosing, setIsClosing] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  const handleClose = () => {
    if (!isClosing && closeOnOutsideClick) {
      setIsClosing(true);
      setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, ANIMATION_DURATION);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      // Give the browser time to paint the initial state
      setTimeout(() => {
        setIsClosing(false);
      }, 10);
    } else {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsMounted(false);
      }, ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEscapeKey(handleClose, isOpen && !isClosing);

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw] h-[95vh]'
  };

  if (!isMounted) return null;

  const isVisible = isOpen && !isClosing;

  return (
    <div 
      className={cn(
        "fixed inset-0 z-50",
        "transition-all duration-300 ease-in-out",
        isVisible
          ? "opacity-100 visible pointer-events-auto" 
          : "opacity-0 invisible pointer-events-none"
      )}
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
      style={{ perspective: '1000px' }}
      onClick={handleClose}
    >
      {/* Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-secondary-900/60 backdrop-blur-[4px]",
          "transition-all duration-300 ease-in-out min-h-screen",
          isVisible ? "opacity-100" : "opacity-0"
        )} 
        style={{ minHeight: '100vh' }}
      />

      {/* Modal Container */}
      <div className="fixed inset-0">
        <div className="flex min-h-screen items-center justify-center p-4 text-center">
          <div
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'relative w-full transform overflow-y-auto rounded-2xl bg-white text-right',
              'shadow-warm-lg transition-all duration-300',
              isVisible
                ? 'opacity-100 translate-y-0 scale-100 rotate-0' 
                : 'opacity-0 -translate-y-4 scale-95 rotate-1',
              sizeClasses[size],
              className
            )}
            style={{
              transformOrigin: 'center 100px',
              willChange: 'transform, opacity',
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.4, 1)',
              maxHeight: 'calc(100vh - 2rem)'
            }}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-secondary-100">
                <div className="px-6 py-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Empty div for spacing when no close button */}
                    {!showCloseButton && <div className="w-8" />}
                    
                    {/* Title Section */}
                    <div className="flex-1">
                      {typeof title === 'string' ? (
                        <h2 
                          className={cn(
                            `font-handwriting-${currentFont}`,
                            'text-xl text-secondary-800 text-center'
                          )}
                          id="modal-title"
                        >
                          {title}
                        </h2>
                      ) : (
                        title
                      )}
                      {description && (
                        <p className="mt-1 text-sm text-secondary-500 text-center">
                          {description}
                        </p>
                      )}
                    </div>

                    {/* Close Button */}
                    {showCloseButton && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClose}
                        className="w-8 h-8 !p-0 rounded-full transition-all duration-200 hover:scale-125 hover:rotate-90 active:scale-95"
                        aria-label="סגור"
                      >
                        ✖
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Content */}
            <div className={cn('p-6', contentClassName)}>
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="sticky bottom-0 bg-white/80 backdrop-blur-sm border-t border-secondary-100 px-6 py-4">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
