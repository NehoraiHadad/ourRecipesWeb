import { recipe } from '@/types';
import { Place } from '@/components/place/types';

const formatRecipeForSharing = (recipe: recipe): string => {
  let content = `🍳 ${recipe.title}\n\n`;

  if (recipe.categories && recipe.categories.length > 0) {
    content += `קטגוריות: ${recipe.categories.join(', ')}\n\n`;
  }

  if (recipe.preparation_time) {
    content += `⏱️ זמן הכנה: ${recipe.preparation_time} דקות\n`;
  }

  if (recipe.difficulty) {
    const difficultyMap = {
      easy: 'קל',
      medium: 'בינוני',
      hard: 'מאתגר'
    };
    content += `📊 רמת קושי: ${difficultyMap[recipe.difficulty as keyof typeof difficultyMap]}\n\n`;
  }

  if (recipe.ingredients && recipe.ingredients.length > 0) {
    content += '🛒 מצרכים:\n';
    content += recipe.ingredients.map(ing => `• ${ing}`).join('\n');
    content += '\n\n';
  }

  if (recipe.instructions) {
    content += '📝 הוראות הכנה:\n';
    if (Array.isArray(recipe.instructions)) {
      content += recipe.instructions.join('\n');
    } else {
      content += recipe.instructions;
    }
    content += '\n';
  } else if (recipe.raw_content) {
    content += `📝 הוראות הכנה:\n${recipe.raw_content}\n`;
  }

  return content;
};

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

export const shareRecipe = (recipe: recipe) => {
  const content = formatRecipeForSharing(recipe);
  return shareContent(content);
};

export const sharePlace = (place: Place) => {
  const content = formatPlaceForSharing(place);
  return shareContent(content);
}; 