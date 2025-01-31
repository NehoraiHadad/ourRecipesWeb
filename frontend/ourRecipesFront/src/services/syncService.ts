import { apiService } from './apiService';
import type { ApiResponse } from '../types/api';

export interface SyncStatus {
  is_syncing: boolean;
  last_sync: string | null;
  total_items?: number;
  processed_items?: number;
}

export interface SyncSessionStatus {
  active: boolean;
  progress: number;
  total: number;
  current_item?: string;
}

export class SyncService {
  private static readonly BASE_PATH = '/sync';

  // Get sync status
  static async getStatus(): Promise<ApiResponse<SyncStatus>> {
    return apiService.get<ApiResponse<SyncStatus>>(`${this.BASE_PATH}/status`);
  }

  // Get sync session status
  static async getSessionStatus(): Promise<ApiResponse<SyncSessionStatus>> {
    return apiService.get<ApiResponse<SyncSessionStatus>>(`${this.BASE_PATH}/session/status`);
  }

  // Refresh sync session
  static async refreshSession(): Promise<ApiResponse<void>> {
    return apiService.post<ApiResponse<void>>(`${this.BASE_PATH}/session/refresh`);
  }

  // Start sync
  static async startSync(): Promise<ApiResponse<void>> {
    return apiService.post<ApiResponse<void>>(this.BASE_PATH);
  }
}

export const syncService = new SyncService(); 