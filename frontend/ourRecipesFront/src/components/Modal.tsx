import useOutsideClick from "../hooks/useOutsideClick";
import { useRef } from "react";
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

  useOutsideClick(modalRef, () => {
    if (closeOnOutsideClick) {
      onClose();
    }
  });

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw] h-[95vh]'
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <div className="fixed inset-0 bg-secondary-900/40 backdrop-blur-sm transition-opacity" />

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div
          ref={modalRef}
          className={cn(
            'relative w-full transform overflow-hidden rounded-2xl bg-white text-right',
            'shadow-warm-lg transition-all duration-300 ease-out',
            sizeClasses[size],
            className
          )}
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
                      onClick={onClose}
                      className="w-8 h-8 !p-0 rounded-full"
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
  );
};

export default Modal;
