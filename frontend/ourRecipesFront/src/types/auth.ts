export interface User {
  id: number | string;  // Can be either number or string (e.g. 'guest_2555649')
  name?: string;
  type: 'guest' | 'telegram' | null;
}

export interface AuthResponse {
  login: boolean;  // Changed from authenticated to login
  canEdit: boolean;
  message?: string;
  token?: string;
  user?: User;  // Changed to match the actual response structure
}

export interface AuthState {
  isAuthenticated: boolean;
  canEdit: boolean;
  isLoading: boolean;
  error: string | null;
  user: User | null;
} 
