import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Typography } from '@/components/ui/Typography';
import { Place } from './types';
import { sharePlace } from '@/utils/share';

interface PlaceCardProps {
  place: Place;
  onEdit: (place: Place) => void;
  onDelete: (place: Place) => void;
}

const getLocationParts = (location?: string) => {
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

const getPlaceEmoji = (type?: string) => {
  const placeTypes = [
    { value: '', label: 'כל הסוגים', emoji: '🏠' },
    { value: 'restaurant', label: 'מסעדה', emoji: '🍽️' },
    { value: 'cafe', label: 'בית קפה', emoji: '☕' },
    { value: 'bar', label: 'בר', emoji: '🍺' },
    { value: 'attraction', label: 'אטרקציה', emoji: '🎡' },
    { value: 'shopping', label: 'קניות', emoji: '🛍️' },
    { value: 'other', label: 'אחר', emoji: '📍' }
  ];
  const placeType = placeTypes.find(t => t.value === type);
  return placeType?.emoji || '📍';
};

export function PlaceCard({ place, onEdit, onDelete }: PlaceCardProps) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow bg-white flex flex-col min-h-[200px]">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary-50 flex items-center justify-center">
            <span className="text-lg">{getPlaceEmoji(place.type)}</span>
          </div>
          <Typography variant="h3" className="text-xl truncate font-medium">{place.name}</Typography>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={() => sharePlace(place)}
            className="p-1.5 hover:bg-secondary-50"
            title="שתף המלצה"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="16 6 12 2 8 6" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="2" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Button>
          <Button variant="ghost" onClick={() => onEdit(place)} className="p-1.5 hover:bg-secondary-50">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Button>
          <Button variant="ghost" onClick={() => onDelete(place)} className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Button>
        </div>
      </div>

      <div className="flex-1">
        {place.description && (
          <Typography variant="body" className="text-secondary-600 mt-3 line-clamp-2 text-sm">
            {place.description}
          </Typography>
        )}

        <div className="mt-4 space-y-3">
          {place.location && (
            <div className="flex items-center text-secondary-600 bg-secondary-50/50 rounded-lg p-2">
              <div className="h-5 w-5 ml-2 flex-shrink-0 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="10" r="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="truncate font-medium">{getLocationParts(place.location).city}</span>
                {getLocationParts(place.location).area && (
                  <span className="text-sm text-secondary-400 truncate">{getLocationParts(place.location).area}</span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {place.website && (
              <a
                href={place.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              >
                <svg className="w-4 h-4 ml-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                אתר
              </a>
            )}
            {place.waze_link && (
              <a
                href={place.waze_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              >
                <svg className="w-4 h-4 ml-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="10" r="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Waze
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-secondary-100 flex justify-between items-center">
        <Typography variant="body" className="text-secondary-500 text-sm truncate flex-1">
          {place.created_by.includes('(') ? place.created_by.split('(')[0].trim() : place.created_by}
        </Typography>
        <div className="flex items-center text-sm flex-shrink-0">
          {place.is_synced ? (
            <div className="flex items-center text-green-600 px-2 py-1 rounded-full">
              <svg className="w-3.5 h-3.5 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="hidden sm:inline">מסונכרן</span>
            </div>
          ) : (
            <div className="flex items-center text-amber-600 px-2 py-1 rounded-full">
              <svg className="w-3.5 h-3.5 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="hidden sm:inline">לא מסונכרן</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
} 