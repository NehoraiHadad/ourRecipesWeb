/**
 * The image half of the recipe edit form: preview, upload from the device and
 * "generate with AI". Extracted from `RecipeEditForm` during stage D so both
 * files stay small.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ProgressIndicator } from '@/components/ui/ProgressIndicator';
import { useProgress, AI_IMAGE_GENERATION_STEPS } from '@/hooks/useProgress';
import { apiService } from '@/services/apiService';

/** Image generation is an AI call — far slower than the default timeout. */
const AI_TIMEOUT = 180000;
const MAX_SIZE = 5 * 1024 * 1024;

interface RecipeImageFieldProps {
  image: string | null;
  onChange: (image: string | null) => void;
  /** The recipe in plain words — what the image model is asked to draw. */
  recipeContent: string;
}

const RecipeImageField: React.FC<RecipeImageFieldProps> = ({ image, onChange, recipeContent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const imageProgress = useProgress({
    steps: AI_IMAGE_GENERATION_STEPS,
    onComplete: () => setIsBusy(false),
    onError: (error) => {
      alert(error.message);
      setIsBusy(false);
    }
  });

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('נא להעלות קובץ תמונה בלבד');
      return;
    }
    if (file.size > MAX_SIZE) {
      alert('גודל התמונה חורג מהמותר (מקסימום 5MB)');
      return;
    }

    setIsBusy(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      onChange(reader.result as string);
      setIsBusy(false);
    };
    reader.onerror = () => {
      alert('שגיאה בקריאת הקובץ');
      setIsBusy(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAIGenerate = async () => {
    try {
      setIsBusy(true);
      imageProgress.start();

      if (!recipeContent.trim()) {
        throw new Error('נדרש למלא כותרת ומצרכים לפני יצירת תמונה');
      }

      imageProgress.startStep(0);
      imageProgress.completeStep(0);

      imageProgress.startStep(1);
      // `POST /api/recipes/generate-image` answers `{ data: { image } }`
      // where `image` is raw base64 (the renderer adds the data: prefix).
      const result = await apiService.post<{ data: { image: string } }>(
        '/api/recipes/generate-image',
        { recipeContent },
        { timeout: AI_TIMEOUT }
      );
      imageProgress.completeStep(1);

      imageProgress.startStep(2);
      onChange(result?.data?.image ?? null);
      imageProgress.completeStep(2);
    } catch (error) {
      console.error('Error generating image:', error);
      imageProgress.errorStep(imageProgress.currentStepIndex, error as Error);
      alert(error instanceof Error ? error.message : 'שגיאה ביצירת התמונה');
    }
  };

  return (
    <div className="space-y-4">
      {isBusy ? (
        <div className="bg-gradient-to-br from-primary-50 to-white rounded-lg p-4 shadow-sm border border-primary-200">
          <ProgressIndicator
            steps={imageProgress.steps}
            currentStepIndex={imageProgress.currentStepIndex}
            variant="bar"
            showEstimatedTime={true}
          />
        </div>
      ) : (
        image && (
          <img
            src={image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`}
            alt="Recipe"
            className="max-w-full h-auto rounded-lg shadow-md"
          />
        )
      )}
      <div className="flex gap-2">
        <input type="file" onChange={handleUpload} accept="image/*" className="hidden" id="photo-upload" />
        <label htmlFor="photo-upload" className="flex-1">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => document.getElementById('photo-upload')?.click()}
          >
            {image ? 'החלף תמונה' : 'העלה תמונה'}
          </Button>
        </label>
        <Button type="button" variant="secondary" onClick={handleAIGenerate} className="flex-1">
          צור תמונה עם AI
        </Button>
      </div>
    </div>
  );
};

export default RecipeImageField;
