export interface Place {
  id: number;
  name: string;
  website?: string;
  description?: string;
  location?: string;
  waze_link?: string;
  type?: string;
  created_by: string;
  created_at: string;
  is_synced: boolean;
  last_sync_at?: string;
}

export interface PlaceFormData {
  name: string;
  website: string;
  description: string;
  location: string;
  waze_link: string;
  type: string;
}

export const getLocationParts = (location?: string) => {
  if (!location) return { area: '', city: '' };
  const parts = location.split(',').map(part => part.trim());
  if (parts.length >= 2) {
    return {
      city: parts[0],
      area: parts[1]
    };
  }
  return {
    city: location,
    area: ''
  };
};

export const placeTypes = [
  { value: '', label: 'כל הסוגים', emoji: '🏠' },
  { value: 'restaurant', label: 'מסעדה', emoji: '🍽️' },
  { value: 'cafe', label: 'בית קפה', emoji: '☕' },
  { value: 'bar', label: 'בר', emoji: '🍺' },
  { value: 'attraction', label: 'אטרקציה', emoji: '🎡' },
  { value: 'shopping', label: 'קניות', emoji: '🛍️' },
  { value: 'other', label: 'אחר', emoji: '📍' }
] as const;

export const sortOptions = [
  { value: 'newest', label: 'חדש ביותר' },
  { value: 'oldest', label: 'ישן ביותר' },
  { value: 'name', label: 'לפי שם' },
  { value: 'area', label: 'לפי אזור' }
] as const; 