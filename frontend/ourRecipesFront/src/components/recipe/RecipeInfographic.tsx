/**
 * "Create an infographic" — an AI rendering of the recipe, generated on demand
 * and offered for download. Self-contained (its own state) so `RecipeDetails`
 * stays a thin composition.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { apiService } from '@/services/apiService';

/** AI routes take far longer than the default timeout. */
const AI_TIMEOUT = 180000;

interface RecipeInfographicProps {
  /** The recipe text handed to the model. */
  recipeContent: string;
  /** Used for the download filename. */
  title: string;
}

const RecipeInfographic: React.FC<RecipeInfographicProps> = ({ recipeContent, title }) => {
  const [image, setImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // `POST /api/recipes/generate-infographic` answers
      // `{ data: { image_url } }` — a permanent Vercel Blob URL (Wave 2A).
      const response = await apiService.post<{ data: { image_url: string } }>(
        '/api/recipes/generate-infographic',
        { recipeContent },
        { timeout: AI_TIMEOUT }
      );

      const generated = response?.data?.image_url;
      if (!generated) throw new Error('No infographic returned');
      setImage(generated);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'נסה שוב מאוחר יותר';
      setError(`שגיאה ביצירת אינפוגרפיקה: ${reason}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div className="flex justify-center">
        <Button
          variant="primary"
          onClick={generate}
          isLoading={isGenerating}
          disabled={isGenerating}
          className="flex items-center gap-2 shadow-warm hover:shadow-lg transition-all"
        >
          <Typography variant="body" className="font-handwriting-amit">
            {isGenerating ? 'יוצר אינפוגרפיקה...' : 'צור אינפוגרפיקה'}
          </Typography>
          <Typography variant="h3" className="text-lg">🎨</Typography>
        </Button>
      </div>

      {error && (
        <Typography variant="body" className="mt-4 text-center text-red-600">
          {error}
        </Typography>
      )}

      {image && (
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <Typography variant="h3" className="font-handwriting-amit">
              אינפוגרפיקה שנוצרה
            </Typography>
            <button
              onClick={() => setImage(null)}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="סגור"
            >
              ✕
            </button>
          </div>
          <div className="relative w-full rounded-lg overflow-hidden shadow-lg">
            <img src={image} alt="אינפוגרפיקה למתכון" className="w-full h-auto" />
          </div>
          <div className="mt-4 flex justify-center gap-4">
            <a
              href={image}
              download={`${title || 'recipe'}-infographic.png`}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Typography variant="body" className="font-handwriting-amit">
                הורד תמונה
              </Typography>
            </a>
          </div>
        </div>
      )}
    </>
  );
};

export default RecipeInfographic;
