import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface FilterPopupProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  triggerRef: React.RefObject<HTMLElement>;
}

export function FilterPopup({ isOpen, onClose, children, triggerRef }: FilterPopupProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const updatePosition = () => {
      if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const windowWidth = document.documentElement.clientWidth;
        const popupWidth = 280; // matches w-[280px]
        
        // Calculate initial position
        let left = rect.right - popupWidth; // Align to right edge of trigger
        
        // Check if popup would go off-screen to the right
        if (left + popupWidth > windowWidth - 16) {
          left = windowWidth - popupWidth - 16;
        }
        
        // Ensure popup doesn't go off-screen to the left
        if (left < 16) {
          left = 16;
        }

        setPosition({
          top: rect.bottom + window.scrollY + 8,
          left,
        });
      }
    };

    // Update position immediately and on scroll/resize
    updatePosition();
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, triggerRef]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/20" 
        onClick={onClose}
      />
      
      {/* Popup */}
      <div 
        className="fixed z-50 w-[280px] bg-white rounded-xl shadow-lg border border-secondary-200 py-2"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
  );
} 