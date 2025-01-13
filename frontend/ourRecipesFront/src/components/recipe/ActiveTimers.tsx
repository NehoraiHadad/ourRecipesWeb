'use client'

import { useState, useEffect } from 'react'
import { useNotification } from '@/context/NotificationContext'
import { useFont } from '@/context/FontContext'

// Add notification sound
const timerEndSound = typeof window !== 'undefined' 
  ? new Audio('/sounds/timer-end.mp3') 
  : null;

// Add mute state management
if (typeof window !== 'undefined') {
  window.isSoundMuted = window.isSoundMuted || false;
}

export const toggleSound = () => {
  if (typeof window !== 'undefined') {
    window.isSoundMuted = !window.isSoundMuted;
    window.listeners.forEach(listener => listener());
  }
}

// Add to global window object
if (typeof window !== 'undefined') {
  window.toggleSound = toggleSound;
}

interface ActiveTimer {
  id: string
  stepNumber: number
  timeLeft: number
  description: string
  isPaused?: boolean
  isEnding?: boolean
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

// Global state for active timers
declare global {
  interface Window {
    activeTimersState: ActiveTimer[]
    listeners: (() => void)[]
    addActiveTimer: (timer: Omit<ActiveTimer, 'id' | 'isPaused'>) => string
    removeActiveTimer: (id: string) => void
    updateActiveTimer: (id: string, updates: Partial<ActiveTimer>) => void
    pauseTimer: (id: string) => void
    resumeTimer: (id: string) => void
    isSoundMuted: boolean
    toggleSound: () => void
  }
}

if (typeof window !== 'undefined') {
  window.activeTimersState = window.activeTimersState || []
  window.listeners = window.listeners || []
}

export const addActiveTimer = (timer: Omit<ActiveTimer, 'id' | 'isPaused'>) => {
  const newTimer = { ...timer, id: Math.random().toString(36).slice(2), isPaused: true }
  if (typeof window !== 'undefined') {
    window.activeTimersState = [...window.activeTimersState, newTimer]
    window.listeners.forEach(listener => listener())
  }
  return newTimer.id
}

export const removeActiveTimer = (id: string) => {
  if (typeof window !== 'undefined') {
    window.activeTimersState = window.activeTimersState.filter(timer => timer.id !== id)
    window.listeners.forEach(listener => listener())
  }
}

export const updateActiveTimer = (id: string, updates: Partial<ActiveTimer>) => {
  if (typeof window !== 'undefined') {
    window.activeTimersState = window.activeTimersState.map(timer => 
      timer.id === id ? { ...timer, ...updates } : timer
    )
    window.listeners.forEach(listener => listener())
  }
}

export const pauseTimer = (id: string) => {
  if (typeof window !== 'undefined') {
    window.activeTimersState = window.activeTimersState.map(timer => 
      timer.id === id ? { ...timer, isPaused: true } : timer
    )
    window.listeners.forEach(listener => listener())
  }
}

export const resumeTimer = (id: string) => {
  if (typeof window !== 'undefined') {
    window.activeTimersState = window.activeTimersState.map(timer => 
      timer.id === id ? { ...timer, isPaused: false } : timer
    )
    window.listeners.forEach(listener => listener())
  }
}

// Expose functions globally
if (typeof window !== 'undefined') {
  window.addActiveTimer = addActiveTimer
  window.removeActiveTimer = removeActiveTimer
  window.updateActiveTimer = updateActiveTimer
  window.pauseTimer = pauseTimer
  window.resumeTimer = resumeTimer
}

export function ActiveTimers() {
  const [timers, setTimers] = useState<ActiveTimer[]>(typeof window !== 'undefined' ? window.activeTimersState : [])
  const { addNotification } = useNotification()
  const { currentFont } = useFont()

  useEffect(() => {
    const handleUpdate = () => {
      if (typeof window !== 'undefined') {
        setTimers([...window.activeTimersState])
      }
    }
    if (typeof window !== 'undefined') {
      window.listeners.push(handleUpdate)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.listeners = window.listeners.filter(l => l !== handleUpdate)
      }
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== 'undefined') {
        window.activeTimersState = window.activeTimersState.map(timer => ({
          ...timer,
          timeLeft: timer.isPaused ? timer.timeLeft : Math.max(0, timer.timeLeft - 1)
        }))

        window.activeTimersState.forEach(timer => {
          if (timer.timeLeft === 0) {
            // Play sound only if not muted
            if (timerEndSound && !window.isSoundMuted) {
              timerEndSound.play().catch(() => {
                // Handle any playback errors silently
              });
            }
            
            // Vibrate if available
            if ('vibrate' in navigator) {
              navigator.vibrate([200, 100, 200]);
            }

            addNotification({
              message: `טיימר ${timer.description} הסתיים!`,
              type: 'info',
              duration: 5000
            })
          }
        })

        window.activeTimersState = window.activeTimersState.filter(timer => timer.timeLeft > 0)
        window.listeners.forEach(listener => listener())
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [addNotification])

  return null // We don't need to render anything anymore
} 