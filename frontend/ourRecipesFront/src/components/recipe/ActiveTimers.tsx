'use client'

import { useState, useEffect } from 'react'
import { useNotification } from '@/context/NotificationContext'
import { useFont } from '@/context/FontContext'

interface ActiveTimer {
  id: string
  stepNumber: number
  timeLeft: number
  description: string
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function ActiveTimers() {
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([])
  const { addNotification } = useNotification()
  const { currentFont } = useFont()

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTimers(prevTimers => {
        const updatedTimers = prevTimers.map(timer => ({
          ...timer,
          timeLeft: Math.max(0, timer.timeLeft - 1)
        }))

        updatedTimers.forEach(timer => {
          if (timer.timeLeft === 0) {
            addNotification({
              message: `טיימר ${timer.stepNumber} הסתיים!`,
              type: 'info',
              duration: 5000
            })
          }
        })

        return updatedTimers.filter(timer => timer.timeLeft > 0)
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [addNotification])

  if (activeTimers.length === 0) return null

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-warm border border-primary-100 p-4 space-y-3">
        <h3 className={`font-handwriting-${currentFont} text-lg text-secondary-800 border-b border-secondary-100 pb-2`}>
          טיימרים פעילים
        </h3>
        <div className="space-y-2.5">
          {activeTimers.map(timer => (
            <div key={timer.id} className="flex items-center gap-3 bg-secondary-50/50 rounded-lg p-2">
              <div className="font-mono text-lg font-medium text-primary-600 bg-white px-2 py-1 rounded-md shadow-sm">
                {formatTime(timer.timeLeft)}
              </div>
              <div className="flex-1">
                <div className={`font-handwriting-${currentFont} text-base text-secondary-700`}>
                  שלב {timer.stepNumber}
                </div>
                <div className="text-xs text-secondary-500 line-clamp-1">
                  {timer.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 