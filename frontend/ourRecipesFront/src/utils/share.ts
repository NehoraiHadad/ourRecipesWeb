import { Place } from '@/components/place/types';

/** All a share link needs — satisfied by `SerializedRecipe` and by list rows. */
interface ShareableRecipe {
  telegram_id: number;
  title: string | null;
}

const formatPlaceForSharing = (place: Place): string => {
  let content = `📍 ${place.name}\n\n`;

  if (place.type) {
    const placeTypes = {
      restaurant: '🍽️ מסעדה',
      cafe: '☕ בית קפה',
      bar: '🍺 בר',
      attraction: '🎡 אטרקציה',
      shopping: '🛍️ קניות',
      other: '📍 אחר'
    };
    content += `סוג: ${placeTypes[place.type as keyof typeof placeTypes] || '📍 אחר'}\n`;
  }

  if (place.location) {
    content += `📍 מיקום: ${place.location}\n`;
  }

  if (place.description) {
    content += `\n${place.description}\n`;
  }

  if (place.website || place.waze_link) {
    content += '\nקישורים:\n';
    if (place.website) content += `🌐 אתר: ${place.website}\n`;
    if (place.waze_link) content += `🗺️ Waze: ${place.waze_link}\n`;
  }

  return content;
};

export const shareContent = async (content: string) => {
  if (navigator.share) {
    try {
      await navigator.share({
        text: content
      });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error sharing:', error);
        // Fallback to clipboard
        await copyToClipboard(content);
      }
    }
  } else {
    // Fallback to clipboard
    await copyToClipboard(content);
  }
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    // You might want to show a toast/notification here
    console.log('Copied to clipboard');
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

export const shareRecipe = (recipe: ShareableRecipe) => {
  // יצירת קישור למתכון - שימוש ב-telegram_id כדי שהלינק יהיה יציב
  const recipeUrl = `${window.location.origin}/r/${recipe.telegram_id}`;
  const shareText = `🍳 ${recipe.title}\n\n${recipeUrl}`;

  if (navigator.share) {
    return navigator.share({
      title: recipe.title ?? '',
      text: `🍳 ${recipe.title}`,
      url: recipeUrl
    }).catch(error => {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error sharing:', error);
        // Fallback to clipboard
        return copyToClipboard(shareText);
      }
    });
  } else {
    // Fallback to clipboard
    return copyToClipboard(shareText);
  }
};

export const sharePlace = (place: Place) => {
  const content = formatPlaceForSharing(place);
  return shareContent(content);
}; 