/**
 * Conflict badge (ARCHITECTURE §4.2): an old-channel edit overwrote content
 * that had also been edited in the app — the channel wins, but a human should
 * glance at what was lost (the overwritten content is kept as a
 * `RecipeVersion`). The next app edit or version restore clears the flag.
 */
import React from 'react';

export function NeedsReviewBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800 font-medium ${className}`}
      title="עריכה בערוץ דרסה עריכה מהאפליקציה — כדאי להשוות מול הגרסאות"
    >
      דורש בדיקה
    </span>
  );
}
