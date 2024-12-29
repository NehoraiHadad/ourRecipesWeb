"use client"
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  canEdit: boolean;
  isLoading: boolean;
  error: string | null;
  user: {
    id?: number;
    name?: string;
    type: 'guest' | 'telegram' | null;
  } | null;
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/check`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Auth check failed');
      
      const data = await response.json();
      setAuthState({
        isAuthenticated: true,
        canEdit: data.canEdit,
        isLoading: false,
        error: null,
        user: {
          id: data.id,
          name: data.name,
          type: data.type
        }
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
