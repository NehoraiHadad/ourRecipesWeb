/**
 * Ports `Place.to_dict` from `backend/ourRecipesBack/models/place.py`
 * field-for-field.
 */
import type { Place } from '@prisma/client';

export function serializePlace(place: Place) {
  return {
    id: place.id,
    name: place.name,
    website: place.website,
    description: place.description,
    location: place.location,
    waze_link: place.waze_link,
    type: place.type,
    created_by: place.created_by,
    created_at: place.created_at ? place.created_at.toISOString() : null,
    is_synced: place.is_synced,
    last_sync: place.last_sync ? place.last_sync.toISOString() : null,
    is_deleted: place.is_deleted
  };
}
