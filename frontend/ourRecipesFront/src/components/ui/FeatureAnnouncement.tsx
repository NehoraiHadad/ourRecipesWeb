'use client'

import { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { Typography } from './Typography';

interface FeatureAnnouncementProps {
  title: string;
  description: string;
  onClose: () => void;
}

export function FeatureAnnouncement({ title, description, onClose }: FeatureAnnouncementProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const entranceTimer = setTimeout(() => setIsVisible(true), 100);
    
    // Auto dismiss after 8 seconds
    const dismissTimer = setTimeout(() => handleClose(), 8000);

    return () => {
      clearTimeout(entranceTimer);
      clearTimeout(dismissTimer);
    };
  }, []);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 500); // Wait for exit animation
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/20 backdrop-blur-[1px] transition-all duration-500",
          "cursor-pointer z-[100]",
          isVisible ? "opacity-100" : "opacity-0",
          isLeaving && "opacity-0"
        )}
        onClick={handleClose}
      />

      {/* Announcement */}
      <div 
        className={cn(
          "fixed bottom-8 right-1/2 translate-x-1/2 z-[101] w-80 md:w-96 transform transition-all duration-500 ease-out",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          isLeaving && "translate-y-4 opacity-0"
        )}
      >
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-primary-50 shadow-2xl ring-1 ring-black/5">
          {/* Animated background gradient */}
          <div 
            className="absolute inset-0 bg-gradient-to-r from-primary-100/20 to-transparent 
                       animate-[gradient_3s_ease-in-out_infinite] opacity-50"
          />
          
          {/* Sparkles */}
          <div className="absolute -right-2 -top-2 h-12 w-12">
            <div className="absolute h-8 w-8 animate-[spin_3s_linear_infinite]">
              <span className="absolute h-1 w-1 rounded-full bg-primary-400/60" style={{ right: '50%', top: '50%' }} />
              <span className="absolute h-1.5 w-1.5 rounded-full bg-primary-300/60" style={{ right: '60%', top: '30%' }} />
              <span className="absolute h-2 w-2 rounded-full bg-primary-200/60" style={{ right: '40%', top: '70%' }} />
            </div>
          </div>

          <div className="relative p-6">
            {/* Header */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <Typography variant="h3" className="text-xl font-semibold text-primary-900">
                {title}
              </Typography>
            </div>

            {/* Content */}
            <Typography variant="body" className="text-base text-primary-800 leading-relaxed">
              {description}
            </Typography>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute left-3 top-3 rounded-full p-1.5 text-primary-400 
                       hover:bg-primary-100 hover:text-primary-600 transition-colors"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-100">
              <div 
                className="h-full bg-primary-500 transition-all duration-[8000ms] ease-linear"
                style={{ width: isVisible ? '0%' : '100%' }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 