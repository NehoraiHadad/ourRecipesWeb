'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { FeatureAnnouncement } from '@/components/ui/FeatureAnnouncement';

const STORAGE_KEY = 'shownFeatures';

interface Feature {
  id: string;
  title: string;
  description: string;
}

interface FeatureAnnouncementContextType {
  showFeature: (feature: Feature) => void;
  hasSeenFeature: (featureId: string) => boolean;
}

const FeatureAnnouncementContext = createContext<FeatureAnnouncementContextType | null>(null);

export function FeatureAnnouncementProvider({ children }: { children: React.ReactNode }) {
  const [shownFeatures, setShownFeatures] = useState<string[]>([]);
  const [currentFeature, setCurrentFeature] = useState<Feature | null>(null);

  // Load shown features from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setShownFeatures(JSON.parse(saved));
    }
  }, []);

  const showFeature = (feature: Feature) => {
    if (!hasSeenFeature(feature.id)) {
      setCurrentFeature(feature);
    }
  };

  const handleFeatureClosed = () => {
    if (currentFeature) {
      // Mark feature as shown
      const updatedFeatures = [...shownFeatures, currentFeature.id];
      setShownFeatures(updatedFeatures);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFeatures));
      setCurrentFeature(null);
    }
  };

  const hasSeenFeature = (featureId: string): boolean => {
    return shownFeatures.includes(featureId);
  };

  return (
    <FeatureAnnouncementContext.Provider value={{ showFeature, hasSeenFeature }}>
      {children}
      {currentFeature && (
        <FeatureAnnouncement
          title={currentFeature.title}
          description={currentFeature.description}
          onClose={handleFeatureClosed}
        />
      )}
    </FeatureAnnouncementContext.Provider>
  );
}

export function useFeatureAnnouncement() {
  const context = useContext(FeatureAnnouncementContext);
  if (!context) {
    throw new Error('useFeatureAnnouncement must be used within a FeatureAnnouncementProvider');
  }
  return context;
} 