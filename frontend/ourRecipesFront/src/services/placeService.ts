import { apiService } from './apiService';
import type { Place, PlaceFormData } from '../components/place/types';

export class PlaceService {
  private static readonly BASE_PATH = '/api/places';

  /** `GET /api/places` answers with a bare array (see `serializePlace`). */
  static async getPlaces(): Promise<Place[]> {
    return apiService.get<Place[]>(this.BASE_PATH);
  }

  /** `POST /api/places` answers with the created place itself (201). */
  static async createPlace(data: PlaceFormData): Promise<Place> {
    return apiService.post<Place>(this.BASE_PATH, data);
  }

  /** `PUT /api/places/:id` answers with the updated place itself. */
  static async updatePlace(id: number, data: PlaceFormData): Promise<Place> {
    return apiService.put<Place>(`${this.BASE_PATH}/${id}`, data);
  }

  /** `DELETE /api/places/:id` is a soft delete answering `204 No Content`. */
  static async deletePlace(id: number): Promise<void> {
    await apiService.delete<null>(`${this.BASE_PATH}/${id}`);
  }
}

export const placeService = new PlaceService();
