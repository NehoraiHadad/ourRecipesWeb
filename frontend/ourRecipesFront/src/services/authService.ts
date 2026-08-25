import { apiService } from './apiService';
import type { ApiResponse } from '../types/api';
import type { AuthResponse, ValidateResponse } from '../types/auth';

/** Login/validate hit the Telegram Bot API for the edit-permission check. */
const AUTH_TIMEOUT = 30000;

interface LoginCredentials {
  telegramData?: any;
  guestName?: string;
}

export class AuthService {
  private static readonly BASE_PATH = '/api/auth';
  private static readonly GUEST_TOKEN_KEY = 'guest_token';
  private static readonly AUTH_TOKEN_KEY = 'auth_token'; // Token for all users (Telegram + Guest)

  // Get auth headers
  getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    // No localStorage outside the browser (SSR / tests).
    if (typeof window === 'undefined') return headers;

    // Try to get auth token (for all users)
    const authToken = localStorage.getItem(AuthService.AUTH_TOKEN_KEY);
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    } else {
      // Fallback to legacy guest token for backward compatibility
      const guestToken = localStorage.getItem(AuthService.GUEST_TOKEN_KEY);
      if (guestToken) {
        headers['Authorization'] = `Bearer ${guestToken}`;
      }
    }

    return headers;
  }

  // Validate current session
  async validate(): Promise<ValidateResponse> {
    // `GET /api/auth/validate` answers a flat body (no `data` envelope) and
    // verifies edit permission against Telegram, so it can outlast
    // apiService's default timeout.
    return apiService.get<ValidateResponse>(`${AuthService.BASE_PATH}/validate`, {
      timeout: AUTH_TIMEOUT
    });
  }

  // Login (Telegram or Guest)
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      let response: AuthResponse;

      // If it's guest login, use guest-login endpoint
      if ('guestName' in credentials) {
        response = await apiService.post<AuthResponse>(
          `${AuthService.BASE_PATH}/guest`,
          credentials,
          { timeout: AUTH_TIMEOUT }
        );

        // Store token in localStorage for guest (backward compatibility)
        if (response.token) {
          localStorage.setItem(AuthService.GUEST_TOKEN_KEY, response.token);
        }
      } else {
        // For Telegram login, send data directly
        response = await apiService.post<AuthResponse>(
          `${AuthService.BASE_PATH}/login`,
          credentials,
          { timeout: AUTH_TIMEOUT }
        );
      }

      // Store token in localStorage for ALL users (iOS fallback when cookies don't work)
      if (response.token) {
        localStorage.setItem(AuthService.AUTH_TOKEN_KEY, response.token);
        console.log('[iOS Fix] Token saved to localStorage as fallback for cookie issues');
      }

      return response;
    } catch (error) {
      console.error('Auth service login error:', error);
      throw error;
    }
  }

  // Logout
  async logout(): Promise<ApiResponse<void>> {
    const response = await apiService.post<ApiResponse<void>>(`${AuthService.BASE_PATH}/logout`);
    // Clear all auth tokens
    localStorage.removeItem(AuthService.AUTH_TOKEN_KEY);
    localStorage.removeItem(AuthService.GUEST_TOKEN_KEY);
    console.log('[iOS Fix] All auth tokens cleared from localStorage');
    return response;
  }
}

export const authService = new AuthService(); 