"use client"
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { authService } from '@/services/authService';
import type { User } from '@/types/auth';

interface AuthState {
  isAuthenticated: boolean;
  canEdit: boolean;
  isLoading: boolean;
  error: string | null;
  user: User | null;
}

export const AuthContext = createContext<{
  authState: AuthState
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>
}>({
  authState: {
    isAuthenticated: false,
    canEdit: false,
    isLoading: true,
    error: null,
    user: null
  },
  setAuthState: () => {}
})

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    canEdit: false,
    isLoading: true,
    error: null,
    user: null
  });

  const checkAuth = useCallback(async () => {
    try {
      const response = await authService.validate();
      
      setAuthState({
        isAuthenticated: response.authenticated,
        canEdit: response.canEdit,
        isLoading: false,
        error: null,
        user: response.user_id ? {
          id: response.user_id,
          name: response.name || '',
          type: (response.type as "guest" | "telegram") || null
        } : null
      });
    } catch (error) {
      setAuthState({
        isAuthenticated: false,
        canEdit: false,
        isLoading: false,
        error: 'Failed to verify authentication',
        user: null
      });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ authState, setAuthState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
