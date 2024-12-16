import React, { useRef, useState, useEffect } from 'react';

interface SwipeableListItemProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  swipeThreshold?: number;
}

export const SwipeableListItem: React.FC<SwipeableListItemProps> = ({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftContent,
  rightContent,
  swipeThreshold = 0.3
}) => {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const diff = e.touches[0].clientX - startX;
    setCurrentX(diff);
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    
    const itemWidth = itemRef.current?.offsetWidth || 0;
    const swipePercentage = Math.abs(currentX) / itemWidth;

    if (swipePercentage > swipeThreshold) {
      if (currentX > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (currentX < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    setIsSwiping(false);
    setCurrentX(0);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) {
        setCurrentX(0);
        setIsSwiping(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const transform = isSwiping ? `translateX(${currentX}px)` : '';
  const transition = isSwiping ? 'none' : 'transform 0.3s ease-out';

  return (
    <div className="relative overflow-hidden touch-pan-y" ref={itemRef}>
      {/* Left action */}
      <div className="absolute inset-y-0 left-0 w-20 transform transition-transform duration-300"
           style={{ opacity: currentX < 0 ? Math.min(Math.abs(currentX) / 100, 1) : 0 }}>
        {leftContent}
      </div>

      {/* Right action */}
      <div className="absolute inset-y-0 right-0 w-20 transform transition-transform duration-300"
           style={{ opacity: currentX > 0 ? Math.min(Math.abs(currentX) / 100, 1) : 0 }}>
        {rightContent}
      </div>

      {/* Main content */}
      <div
        className="relative bg-white"
        style={{ transform, transition }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}; 