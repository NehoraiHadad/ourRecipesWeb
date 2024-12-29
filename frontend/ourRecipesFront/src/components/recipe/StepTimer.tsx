'use client'

import { useState, useEffect } from 'react'
import { useNotification } from '@/context/NotificationContext'

interface StepTimerProps {
  stepNumber: number
  defaultMinutes?: number
}

export function StepTimer({ stepNumber, defaultMinutes = 0 }: StepTimerProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(defaultMinutes * 60)
  const [customMinutes, setCustomMinutes] = useState(defaultMinutes.toString())
  const [isEditing, setIsEditing] = useState(false)
  const { addNotification } = useNotification()

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleStart = () => {
    if (timeLeft === 0) {
      const minutes = parseInt(customMinutes)
      if (isNaN(minutes) || minutes <= 0) return
      setTimeLeft(minutes * 60)
    }
    setIsRunning(true)
    setIsEditing(false)
  }

  const handlePause = () => {
    setIsRunning(false)
  }

  const handleReset = () => {
    setIsRunning(false)
    setTimeLeft(parseInt(customMinutes) * 60 || 0)
  }

  const handleTimeClick = () => {
    if (!isRunning) {
      setIsEditing(true)
    }
  }

  const handleTimeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const minutes = parseInt(customMinutes)
    if (!isNaN(minutes) && minutes > 0) {
      setTimeLeft(minutes * 60)
      setIsEditing(false)
    }
  }

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout

    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false)
            addNotification({
              message: `טיימר ${stepNumber} הסתיים!`,
              type: 'info',
              duration: 5000
            })
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => clearInterval(interval)
  }, [isRunning, timeLeft, stepNumber, addNotification])

  return (
    <div className="flex items-center gap-2">
      {isEditing ? (
        <form onSubmit={handleTimeSubmit} className="flex items-center gap-1">
          <input
            type="number"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            className="w-16 px-2 py-1 text-sm border rounded"
            min="1"
            max="999"
          />
          <button
            type="submit"
            className="px-2 py-1 text-xs bg-secondary-100 rounded hover:bg-secondary-200"
          >
            קבע
          </button>
        </form>
      ) : (
        <div
          onClick={handleTimeClick}
          className={`font-mono text-sm ${!isRunning && 'cursor-pointer hover:text-secondary-600'}`}
        >
          {formatTime(timeLeft)}
        </div>
      )}

      <div className="flex gap-1">
        {!isRunning ? (
          <button
            onClick={handleStart}
            className="p-1 text-green-600 hover:text-green-700"
            title="התחל"
          >
            ▶️
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="p-1 text-yellow-600 hover:text-yellow-700"
            title="השהה"
          >
            ⏸️
          </button>
        )}
        <button
          onClick={handleReset}
          className="p-1 text-red-600 hover:text-red-700"
          title="אפס"
        >
          🔄
        </button>
      </div>
    </div>
  )
} 