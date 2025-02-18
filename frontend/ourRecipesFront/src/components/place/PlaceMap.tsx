'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Place } from './types';

// Fix for default marker icons in Next.js
const DefaultIcon = L.icon({
  iconUrl: '/images/marker-icon.png',
  iconRetinaUrl: '/images/marker-icon-2x.png',
  shadowUrl: '/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface PlaceMapProps {
  places: Place[];
  className?: string;
}

interface GeocodedPlace extends Place {
  coordinates?: [number, number];
}

// Load cache from localStorage
const CACHE_KEY = 'geocoding_cache';
const geocodeCache: Record<string, [number, number] | undefined> = (() => {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(CACHE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.error('Failed to load geocoding cache:', e);
    return {};
  }
})();

// Save cache to localStorage
const saveCache = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(geocodeCache));
  } catch (e) {
    console.error('Failed to save geocoding cache:', e);
  }
};

async function geocodeLocation(location: string): Promise<[number, number] | undefined> {
  try {
    // Check cache first
    if (location in geocodeCache) {
      console.log('Found in cache:', location);
      return geocodeCache[location];
    }

    // Extract the city name (before the comma)
    const city = location.split(',')[0].trim();
    
    // First try with Israel
    const withIsrael = `${city}, ישראל`;
    console.log('Trying with Israel:', withIsrael);
    let response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(withIsrael)}`);
    let data = await response.json();
    console.log('Result:', { query: withIsrael, data });
    
    if (data && data[0]) {
      const result: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      geocodeCache[location] = result;
      saveCache();
      return result;
    }
    
    // If not found, try just the city name
    console.log('Trying just city:', city);
    response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`);
    data = await response.json();
    console.log('Result:', { query: city, data });
    
    if (data && data[0]) {
      const result: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      geocodeCache[location] = result;
      saveCache();
      return result;
    }
    
    // Cache negative results too
    geocodeCache[location] = undefined;
    saveCache();
    console.log('No results found for:', location);
    return undefined;
  } catch (error) {
    console.error('Geocoding error:', error);
    return undefined;
  }
}

export function PlaceMap({ places, className = '' }: PlaceMapProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [geocodedPlaces, setGeocodedPlaces] = useState<GeocodedPlace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    async function geocodePlaces() {
      setIsLoading(true);
      const geocoded = await Promise.all(
        places.map(async (place) => {
          if (!place.location) return { ...place };
          
          // Add 1 second delay between requests to respect Nominatim's usage policy
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const coordinates = await geocodeLocation(place.location);
          return {
            ...place,
            coordinates
          };
        })
      );
      setGeocodedPlaces(geocoded);
      setIsLoading(false);
    }

    if (places.length > 0) {
      geocodePlaces();
    }
  }, [places]);

  // Center on Israel by default
  const defaultCenter: [number, number] = [31.7683, 35.2137];
  const defaultZoom = 8;

  if (!isMounted) {
    return null;
  }

  return (
    <div className={`w-full h-[500px] rounded-lg overflow-hidden ${className}`}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        scrollWheelZoom={false}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {isLoading ? (
          <div className="leaflet-container-loading">
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-[1000]">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent"></div>
                <div className="mt-2 text-primary-600">טוען מיקומים...</div>
              </div>
            </div>
          </div>
        ) : (
          geocodedPlaces.map((place) => {
            if (place.coordinates) {
              return (
                <Marker key={place.id} position={place.coordinates}>
                  <Popup>
                    <div className="text-right">
                      <h3 className="font-bold">{place.name}</h3>
                      <p className="text-sm mt-1">{place.location}</p>
                      {place.description && <p className="text-sm mt-1">{place.description}</p>}
                      {place.website && (
                        <a
                          href={place.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline block mt-1"
                        >
                          לאתר
                        </a>
                      )}
                      {place.waze_link && (
                        <a
                          href={place.waze_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline block mt-1"
                        >
                          Waze
                        </a>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            }
            return null;
          })
        )}
      </MapContainer>
    </div>
  );
} 