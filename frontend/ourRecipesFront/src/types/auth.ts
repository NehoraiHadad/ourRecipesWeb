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

/** `GET /api/auth/validate` answers with this flat body (no `data` envelope). */
export interface ValidateResponse {
  authenticated: boolean;
  canEdit: boolean;
  user_id?: string;
  name?: string;
  type?: string;
  message?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  canEdit: boolean;
  isLoading: boolean;
  error: string | null;
  user: User | null;
} 
