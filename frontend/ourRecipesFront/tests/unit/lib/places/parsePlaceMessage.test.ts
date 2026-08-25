import { describe, it, expect } from 'vitest';
import { parsePlaceMessage } from '@/lib/places/ingest';
import { formatPlaceCreateMessage, formatPlaceUpdateMessage } from '@/lib/telegram/placeMirror';

describe('parsePlaceMessage', () => {
  it('round-trips what placeMirror writes', () => {
    const place = {
      name: 'נאיה',
      type: 'restaurant',
      website: 'https://na-ya.com',
      location: 'קרית ענבים',
      waze_link: 'https://waze.com/ul/abc',
      description: 'טעים ובשרי'
    };

    const parsed = parsePlaceMessage(formatPlaceCreateMessage(place, 'n.h'));
    expect(parsed).toMatchObject({ ...place, created_by: 'n.h', isDeleted: false });
  });

  it('maps "לא צוין" fields back to null', () => {
    const text = [
      '🍽️ המלצה חדשה',
      '',
      'שם: כפרית הטאבון',
      'סוג: restaurant',
      'אתר: לא צוין',
      'מיקום: ברכיה',
      'Waze: לא צוין',
      'תיאור: לא צוין',
      'נוסף על ידי: אורח_3952'
    ].join('\n');

    expect(parsePlaceMessage(text)).toMatchObject({
      name: 'כפרית הטאבון',
      website: null,
      waze_link: null,
      description: null,
      created_by: 'אורח_3952'
    });
  });

  it('ignores the "(עודכן)" suffix line of update messages', () => {
    const message = formatPlaceUpdateMessage(
      { name: 'קפה', type: 'cafe', website: null, location: null, waze_link: null, description: null },
      'אורח'
    );
    expect(parsePlaceMessage(message)).toMatchObject({ name: 'קפה', isDeleted: false });
  });

  it('detects the deletion marker', () => {
    const parsed = parsePlaceMessage('☕ המלצה\n\nשם: קפה\n\n❌ נמחק על ידי: אורח');
    expect(parsed?.isDeleted).toBe(true);
  });

  it('returns null for a message without a שם: line', () => {
    expect(parsePlaceMessage('🍽️ המלצה חדשה\n\nסתם טקסט')).toBeNull();
  });
});
