import { apiService } from './apiService';
import type { ApiResponse } from '../types/api';
import type { AuthResponse, User } from '../types/auth';

interface LoginCredentials {
  telegramData?: any;
  guestName?: string;
}

export class AuthService {
  private static readonly BASE_PATH = '/auth';
  private static readonly GUEST_TOKEN_KEY = 'guest_token';

  // Get auth headers
  getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    const guestToken = localStorage.getItem(AuthService.GUEST_TOKEN_KEY);
    if (guestToken) {
      headers['Authorization'] = `Bearer ${guestToken}`;
    }
    
    return headers;
  }

  // Validate current session
  async validate(): Promise<ApiResponse<AuthResponse>> {
    return apiService.get<ApiResponse<AuthResponse>>(`${AuthService.BASE_PATH}/validate`);
  }

  // Login (Telegram or Guest)
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      // If it's guest login, use guest-login endpoint
      if ('guestName' in credentials) {
        const response = await apiService.post<AuthResponse>(`${AuthService.BASE_PATH}/guest`, credentials);
        
        // Store token in localStorage if it exists
        if (response.token) {
          localStorage.setItem(AuthService.GUEST_TOKEN_KEY, response.token);
        }
        return response;
      }
      
      // For Telegram login, send data directly
      const response = await apiService.post<AuthResponse>(`${AuthService.BASE_PATH}/login`, credentials);
      return response;
    } catch (error) {
      console.error('Auth service login error:', error);
      throw error;
    }
  }

  // Logout
  async logout(): Promise<ApiResponse<void>> {
    const response = await apiService.post<ApiResponse<void>>(`${AuthService.BASE_PATH}/logout`);
    localStorage.removeItem(AuthService.GUEST_TOKEN_KEY);
    return response;
  }

  // Get current user
  async getCurrentUser(): Promise<ApiResponse<User>> {
    return apiService.get<ApiResponse<User>>(`${AuthService.BASE_PATH}/me`);
  }
}

export const authService = new AuthService(); 