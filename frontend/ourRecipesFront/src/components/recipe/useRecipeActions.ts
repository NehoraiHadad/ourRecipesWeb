/**
 * The write side of the recipe view (STRUCTURE_REFACTOR_TASKS.md §E1/§E2).
 *
 * Every path — manual edit, AI reformat, version restore — ends with the
 * server's own parse of the saved text: `PUT` answers with the re-parsed
 * `SerializedRecipe` and the restore route is followed by a fresh `GET`. The
 * browser never parses recipe text to refresh what it shows.
 */
import { useEffect, useState } from 'react';
import { apiService } from '@/services/apiService';
import { RecipeService } from '@/services/recipeService';
import { VersionService } from '@/services/versionService';
import type { SerializedRecipe } from '@/lib/serializers/recipeTypes';
import type { RecipeEditPayload } from './RecipeEditForm';

/** AI routes take far longer than the default timeout. */
const AI_TIMEOUT = 180000;

export function useRecipeActions(initial: SerializedRecipe) {
  const [recipe, setRecipe] = useState<SerializedRecipe>(initial);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  /** AI text waiting for approval — channel format, not saved yet. */
  const [aiPreview, setAiPreview] = useState<string | null>(null);

  useEffect(() => {
    setRecipe(initial);
    setAiPreview(null);
  }, [initial]);

  /** Saves a channel message and adopts the recipe the server parsed from it. */
  const save = async (payload: RecipeEditPayload): Promise<boolean> => {
    setIsLoading(true);
    try {
      const updated = await RecipeService.saveRecipe(recipe.telegram_id, {
        newText: payload.newText,
        image: payload.image
      });
      setRecipe(updated);
      setAiPreview(null);
      setMessage('המתכון נשמר בהצלחה');
      return true;
    } catch (error) {
      const notModified = error instanceof Error
        && error.message?.toLowerCase().includes('not modified');
      setMessage(notModified ? 'לא בוצעו שינויים במתכון' : 'שגיאה בשמירת המתכון');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /** Asks the AI to rewrite the message; the answer is previewed, not saved. */
  const requestReformat = async () => {
    setIsLoading(true);
    try {
      // `POST /api/recipes/reformat` answers `{ data: { message } }`.
      const response = await apiService.post<{ data: { message: string } }>(
        '/api/recipes/reformat',
        { text: recipe.raw_content },
        { timeout: AI_TIMEOUT }
      );

      const reformatted = response?.data?.message;
      if (!reformatted) throw new Error('No reformatted text returned');
      setAiPreview(reformatted);
    } catch {
      setMessage('שגיאה בעיבוד המתכון');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Restores a version, then re-reads the recipe: the restore route answers
   * with the flat `{ message, title, details, image }` body, while the parsed
   * fields live in the row the write just refreshed.
   */
  const restoreVersion = async (versionId: number) => {
    setIsLoading(true);
    try {
      await VersionService.restoreVersion(recipe.telegram_id, versionId);
      setRecipe(await RecipeService.fetchRecipe(recipe.telegram_id));
      setMessage('הגרסה שוחזרה בהצלחה');
      return true;
    } catch (error) {
      console.error('Error restoring version:', error);
      setMessage('שגיאה בשחזור הגרסה');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    recipe,
    isLoading,
    message,
    aiPreview,
    clearMessage: () => setMessage(''),
    discardAiPreview: () => setAiPreview(null),
    save,
    saveAiPreview: () => (aiPreview ? save({ newText: aiPreview, image: null }) : Promise.resolve(false)),
    requestReformat,
    restoreVersion
  };
}
