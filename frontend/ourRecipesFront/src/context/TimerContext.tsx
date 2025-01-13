'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNotification } from './NotificationContext';
import { timerDB } from '@/db/timerDB';
import { useServiceWorker } from '@/hooks/useServiceWorker';

export interface Timer {
  id: string;
  recipeId: string;
  recipeName: string;
  stepNumber: number;
  timeLeft: number;
  description: string;
  isPaused?: boolean;
  isEnding?: boolean;
}

interface TimerContextType {
  timers: Timer[];
  getRecipeTimers: (recipeId: string) => Timer[];
  isSoundMuted: boolean;
  addTimer: (timer: Omit<Timer, 'id' | 'isPaused'>) => Promise<string>;
  removeTimer: (id: string) => Promise<void>;
  updateTimer: (id: string, updates: Partial<Timer>) => Promise<void>;
  pauseTimer: (id: string) => Promise<void>;
  resumeTimer: (id: string) => Promise<void>;
  toggleSound: () => Promise<void>;
}

const TimerContext = createContext<TimerContextType | null>(null);

// Add notification sound
const timerEndSound = typeof window !== 'undefined' 
  ? new Audio('/sounds/timer-end.mp3') 
  : null;

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const { addNotification } = useNotification();
  const [isInitialized, setIsInitialized] = useState(false);
  const { sendNotification, isSupported: isServiceWorkerSupported } = useServiceWorker();

  // Initialize DB and load saved state
  useEffect(() => {
    const init = async () => {
      try {
        await timerDB.init();
        const savedTimers = await timerDB.getAllTimers();
        const settings = await timerDB.getSettings();
        
        setTimers(savedTimers);
        setIsSoundMuted(settings.isSoundMuted);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize timer database:', error);
        addNotification({
          message: 'שגיאה בטעינת הטיימרים',
          type: 'error',
          duration: 5000
        });
      }
    };

    init();
  }, [addNotification]);

  const addTimer = async (timer: Omit<Timer, 'id' | 'isPaused'>) => {
    const id = Math.random().toString(36).slice(2);
    const newTimer = { ...timer, id, isPaused: true };
    
    await timerDB.saveTimer(newTimer);
    setTimers(prev => [...prev, newTimer]);
    
    return id;
  };

  const removeTimer = async (id: string) => {
    await timerDB.removeTimer(id);
    setTimers(prev => prev.filter(timer => timer.id !== id));
  };

  const updateTimer = async (id: string, updates: Partial<Timer>) => {
    await timerDB.updateTimer(id, updates);
    setTimers(prev => prev.map(timer => 
      timer.id === id ? { ...timer, ...updates } : timer
    ));
  };

  const pauseTimer = async (id: string) => {
    await timerDB.updateTimer(id, { isPaused: true });
    setTimers(prev => prev.map(timer => 
      timer.id === id ? { ...timer, isPaused: true } : timer
    ));
  };

  const resumeTimer = async (id: string) => {
    await timerDB.updateTimer(id, { isPaused: false });
    setTimers(prev => prev.map(timer => 
      timer.id === id ? { ...timer, isPaused: false } : timer
    ));
  };

  const toggleSound = async () => {
    const newMutedState = !isSoundMuted;
    await timerDB.saveSettings({ isSoundMuted: newMutedState, notificationsEnabled: false });
    setIsSoundMuted(newMutedState);
  };

  const getRecipeTimers = (recipeId: string) => {
    return timers.filter(timer => timer.recipeId === recipeId);
  };

  // Timer countdown effect
  useEffect(() => {
    if (!isInitialized) return;

    const interval = setInterval(async () => {
      setTimers(prevTimers => {
        const updatedTimers = prevTimers.map(timer => ({
          ...timer,
          timeLeft: timer.isPaused ? timer.timeLeft : Math.max(0, timer.timeLeft - 1)
        }));

        // Handle completed timers
        updatedTimers.forEach(async timer => {
          if (timer.timeLeft === 0) {
            // Play sound if not muted
            if (timerEndSound && !isSoundMuted) {
              timerEndSound.play().catch(() => {
                // Handle any playback errors silently
              });
            }
            
            // Vibrate if available
            if ('vibrate' in navigator) {
              navigator.vibrate([200, 100, 200]);
            }

            // Send notification through Service Worker if supported
            if (isServiceWorkerSupported) {
              sendNotification(`${timer.recipeName}: ${timer.description}`);
            }

            // Also show in-app notification
            addNotification({
              message: `${timer.recipeName} - טיימר ${timer.description} הסתיים!`,
              type: 'info',
              duration: 5000
            });

            // Remove from DB
            await timerDB.removeTimer(timer.id);
          } else {
            // Update time in DB
            await timerDB.updateTimer(timer.id, { timeLeft: timer.timeLeft });
          }
        });

        return updatedTimers.filter(timer => timer.timeLeft > 0);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isInitialized, isSoundMuted, addNotification, isServiceWorkerSupported, sendNotification]);

  const value = {
    timers,
    getRecipeTimers,
    isSoundMuted,
    addTimer,
    removeTimer,
    updateTimer,
    pauseTimer,
    resumeTimer,
    toggleSound
  };

  if (!isInitialized) {
    return null; // Or a loading spinner
  }

  return (
    <TimerContext.Provider value={value}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
} 