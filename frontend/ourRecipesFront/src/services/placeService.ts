import { apiService } from './apiService';
import type { ApiResponse } from '../types/api';
import type { Place, PlaceFormData } from '../components/place/types';

export class PlaceService {
  private static readonly BASE_PATH = '/places';

  // Get all places
  static async getPlaces(): Promise<ApiResponse<Place[]>> {
    return apiService.get<ApiResponse<Place[]>>(this.BASE_PATH);
  }

  // Get a single place by ID
  static async getPlaceById(id: number): Promise<ApiResponse<Place>> {
    return apiService.get<ApiResponse<Place>>(`${this.BASE_PATH}/${id}`);
  }

  // Create a new place
  static async createPlace(data: PlaceFormData): Promise<ApiResponse<Place>> {
    return apiService.post<ApiResponse<Place>>(this.BASE_PATH, data);
  }

  // Update a place
  static async updatePlace(id: number, data: PlaceFormData): Promise<ApiResponse<Place>> {
    return apiService.put<ApiResponse<Place>>(`${this.BASE_PATH}/${id}`, data);
  }

  // Delete a place
  static async deletePlace(id: number): Promise<ApiResponse<void>> {
    return apiService.delete<ApiResponse<void>>(`${this.BASE_PATH}/${id}`);
  }

  // Sync places
  static async syncPlaces(): Promise<ApiResponse<Place[]>> {
    return apiService.post<ApiResponse<Place[]>>(`${this.BASE_PATH}/sync`);
  }
}

export const placeService = new PlaceService(); 