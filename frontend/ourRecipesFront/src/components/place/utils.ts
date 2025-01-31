import { Place } from './types';
import { getLocationParts } from './types';

export const filterAndSortPlaces = (
  places: Place[],
  { searchQuery, selectedType, selectedArea, sortBy }: {
    searchQuery: string;
    selectedType: string;
    selectedArea: string;
    sortBy: string;
  }
) => {
  if (!Array.isArray(places)) return [];
  
  return places
    .filter(place => {
      const matchesSearch = !searchQuery || 
        place.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        place.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        place.location?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = !selectedType || place.type === selectedType;
      
      const placeArea = getLocationParts(place.location).area || getLocationParts(place.location).city;
      const matchesArea = !selectedArea || placeArea === selectedArea;
      
      return matchesSearch && matchesType && matchesArea;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        case 'area':
          const areaA = getLocationParts(a.location).area || getLocationParts(a.location).city || '';
          const areaB = getLocationParts(b.location).area || getLocationParts(b.location).city || '';
          return areaA.localeCompare(areaB);
        default:
          return 0;
      }
    });
}; 