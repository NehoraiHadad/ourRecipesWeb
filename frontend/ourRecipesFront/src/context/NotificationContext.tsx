'use client'

import { createContext, useContext, useReducer, ReactNode } from 'react'
import { Toast } from '@/components/ui/Toast'

type NotificationType = 'success' | 'error' | 'info' | 'warning'

interface Notification {
  id: string
  message: string
  type: NotificationType
  duration?: number
}

interface NotificationState {
  notifications: Notification[]
}

type NotificationAction = 
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id'> }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }

const NotificationContext = createContext<{
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
} | null>(null)

function notificationReducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case 'ADD_NOTIFICATION':
      return {
        notifications: [
          ...state.notifications,
          { ...action.payload, id: Date.now().toString() }
        ]
      }
    case 'REMOVE_NOTIFICATION':
      return {
        notifications: state.notifications.filter(
          notification => notification.id !== action.payload
        )
      }
    default:
      return state
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(notificationReducer, { notifications: [] })

  const addNotification = (notification: Omit<Notification, 'id'>) => {
    dispatch({ type: 'ADD_NOTIFICATION', payload: notification })
  }

  const removeNotification = (id: string) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id })
  }

  return (
    <NotificationContext.Provider 
      value={{ 
        notifications: state.notifications,
        addNotification,
        removeNotification
      }}
    >
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {state.notifications.map(notification => (
          <Toast
            key={notification.id}
            message={notification.message}
            variant={notification.type}
            duration={notification.duration}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
} 