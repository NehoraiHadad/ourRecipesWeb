import React, { useState, ChangeEvent } from "react";
import Spinner from "@/components/ui/Spinner";
import TypingEffect from "@/components/TypingEffect";
import RecipeDisplay from "./RecipeDisplay";
import RawRecipeView from "@/components/recipe/RawRecipeView";
import { hasStructuredContent } from "@/lib/recipes/recipeView";
import { useAuthContext } from "../context/AuthContext";
import { useNotification } from '@/context/NotificationContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FeatureIndicator } from '@/components/ui/FeatureIndicator';
import { ProgressIndicator } from '@/components/ui/ProgressIndicator';
import { useProgress, AI_IMAGE_GENERATION_STEPS, AI_RECIPE_GENERATION_STEPS } from '@/hooks/useProgress';
import { apiService } from '@/services/apiService';
import { RecipeService } from '@/services/recipeService';
import type { SerializedRecipe } from '@/lib/serializers/recipeTypes';

/** The AI routes take far longer than apiService's default timeout. */
const AI_TIMEOUT = 180000;

type MealType = "ארוחת בוקר" | "ארוחת צהריים" | "ארוחת ערב" | "חטיף";

const MealSuggestionForm: React.FC = () => {
  const { authState } = useAuthContext();
  const [ingredients, setIngredients] = useState<string>("");
  const [mealType, setMealType] = useState<MealType>("ארוחת בוקר");
  const [quickPrep, setQuickPrep] = useState<boolean>(false);
  const [childFriendly, setChildFriendly] = useState<boolean>(false);
  const [additionalRequests, setAdditionalRequests] = useState<string>("");
  const [photoRequested, setPhotoRequested] = useState<boolean>(false);
  const [recipe, setRecipe] = useState<SerializedRecipe | null>(null);
  const [loadingRecipe, setLoadingRecipe] = useState<boolean>(false);
  const [loadingPhoto, setLoadingPhoto] = useState<boolean>(false);
  const [recipeText, setRecipeText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [savingRecipe, setSavingRecipe] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  /** The exact text that was last saved — refining produces new text, which may be saved again. */
  const [savedText, setSavedText] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const { addNotification } = useNotification()
  const [refinementRequest, setRefinementRequest] = useState<string>("");
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [refinementCount, setRefinementCount] = useState<number>(0);
  const [refinementHistory, setRefinementHistory] = useState<string[]>([]);

  // Progress tracking for image generation
  const imageProgress = useProgress({
    steps: AI_IMAGE_GENERATION_STEPS,
    onComplete: () => {
      setLoadingPhoto(false);
    },
    onError: (error) => {
      setError(error.message);
      setLoadingPhoto(false);
    }
  });

  // Progress tracking for recipe generation
  const recipeProgress = useProgress({
    steps: AI_RECIPE_GENERATION_STEPS,
    onComplete: () => {
      setLoadingRecipe(false);
    },
    onError: (error) => {
      setError(error.message);
      setLoadingRecipe(false);
    }
  });

  const fetchRecipe = async () => {
    setLoadingRecipe(true);
    setError("");
    recipeProgress.start();

    try {
      // Step 1: Analyze ingredients
      recipeProgress.startStep(0);
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate analysis
      recipeProgress.completeStep(0);

      // Step 2: Generate recipe
      recipeProgress.startStep(1);
      // `POST /api/recipes/suggest` answers `{ data: { message, recipe } }` —
      // `recipe` is already parsed server-side (STRUCTURE_REFACTOR_TASKS.md §D2).
      const response = await apiService.post<{ data: { message: string; recipe: SerializedRecipe } }>(
        "/api/recipes/suggest",
        {
          ingredients,
          mealType,
          quickPrep,
          childFriendly,
          additionalRequests,
        },
        { timeout: AI_TIMEOUT }
      );

      const result = response?.data;
      recipeProgress.completeStep(1);

      // Step 3: Format recipe
      recipeProgress.startStep(2);
      if (result?.message && result.recipe) {
        setRecipeText(result.message);
        setRecipe(result.recipe);
        recipeProgress.completeStep(2);

        // Fetch photo if requested
        if (photoRequested) {
          fetchPhoto(result.message);
        }
      } else {
        throw new Error("No recipe received");
      }
    } catch (error: any) {
      recipeProgress.errorStep(recipeProgress.currentStepIndex, error);
      setError(error.message);
      setRecipe(null);
    }
  };

  const refineRecipe = async () => {
    if (!recipeText || !refinementRequest) return;
    if (refinementCount >= 3) {
      addNotification({
        message: 'הגעת למקסימום השיפורים האפשרי (3)',
        type: 'warning',
        duration: 5000
      });
      return;
    }

    setLoadingRecipe(true);
    setError("");
    try {
      // `POST /api/recipes/refine` takes `{ recipeText, refinementRequest }`
      // and answers `{ data: { message, recipe } }` — `recipe` is already
      // parsed server-side (STRUCTURE_REFACTOR_TASKS.md §D2).
      const response = await apiService.post<{ data: { message: string; recipe: SerializedRecipe } }>(
        "/api/recipes/refine",
        {
          recipeText,
          refinementRequest,
        },
        { timeout: AI_TIMEOUT }
      );

      const result = response?.data;
      if (result?.message && result.recipe) {
        setRecipeText(result.message);
        setRecipe(result.recipe);

        // Update refinement history and count
        setRefinementHistory(prev => [...prev, refinementRequest]);
        setRefinementCount(prev => prev + 1);
        
        // Clear refinement request after successful refinement
        setRefinementRequest("");
        
        // Fetch new photo if requested
        if (photoRequested) {
          fetchPhoto(result.message);
        }
      } else {
        throw new Error("No recipe received");
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const fetchPhoto = async (recipeText: string) => {
    setLoadingPhoto(true);
    imageProgress.start();

    try {
      // Step 1: Analyze recipe content
      imageProgress.startStep(0);
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate analysis
      imageProgress.completeStep(0);

      // Step 2: Generate image
      imageProgress.startStep(1);
      // `POST /api/recipes/generate-image` answers `{ data: { image_url } }`
      // — a permanent Vercel Blob URL, not a data URI (Wave 2A).
      const response = await apiService.post<{ data: { image_url: string } }>(
        "/api/recipes/generate-image",
        { recipeContent: recipeText },
        { timeout: AI_TIMEOUT }
      );

      imageProgress.completeStep(1);

      // Step 3: Optimize image
      imageProgress.startStep(2);
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate optimization
      const imageUrl = response?.data?.image_url;
      if (imageUrl) {
        setRecipe((prev) => (prev ? { ...prev, image_url: imageUrl } : prev));
      }
      imageProgress.completeStep(2);

    } catch (error: any) {
      imageProgress.errorStep(imageProgress.currentStepIndex, error);
      setError(error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      fetchRecipe();
    } catch (error) {
      addNotification({
        message: 'שגיאה בקבלת הצעת ארוחה',
        type: 'error',
        duration: 5000
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRefinementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refinementRequest.trim()) return;
    
    setLoadingRecipe(true);
    try {
      await refineRecipe();
    } catch (error) {
      addNotification({
        message: 'שגיאה בשיפור המתכון',
        type: 'error',
        duration: 5000
      });
    } finally {
      setLoadingRecipe(false);
    }
  };

  const handleMealTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setMealType(event.target.value as MealType);
  };

  const handleCancel = () => {
    setIngredients("");
    setMealType("ארוחת בוקר");
    setQuickPrep(false);
    setChildFriendly(false);
    setAdditionalRequests("");
    setPhotoRequested(false);
    setRecipe(null);
    setError("");
    setRefinementRequest("");
    setIsRefining(false);
    setRefinementCount(0);
    setRefinementHistory([]);
    setSaveMessage(null);
    setSavedText(null);
  };

  // Save via `POST /api/recipes` — a plain DB write (Flask's `POST /send_recipe` was merged in).
  const saveRecipe = async (data: { newText: string; image?: string | null }) => {
    setSavingRecipe(true);
    try {
      await RecipeService.addRecipe(data);
      setSavedText(data.newText);
      setSaveMessage("המתכון נשמר בהצלחה בספר המתכונים");
    } catch (error) {
      console.error("Error saving recipe:", error);
      addNotification({ message: 'שגיאה בשמירת המתכון', type: 'error', duration: 5000 });
    } finally {
      setSavingRecipe(false);
    }
  };

  return (
    <div className="w-full">
      {recipe ? (
        <div className="space-y-4">
          {loadingPhoto && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-secondary-200">
              <ProgressIndicator
                steps={imageProgress.steps}
                currentStepIndex={imageProgress.currentStepIndex}
                variant="bar"
                showEstimatedTime={true}
              />
            </div>
          )}
          {hasStructuredContent(recipe) ? (
            <RecipeDisplay recipe={recipe} />
          ) : (
            <RawRecipeView title={recipe.title} text={recipe.raw_content} image={recipe.image_url} />
          )}

          {/* Recipe Refinement Form */}
          <div className="mt-4 space-y-4">
            {refinementHistory.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-secondary-700">היסטוריית שיפורים:</h3>
                <div className="space-y-1">
                  {refinementHistory.map((request, index) => (
                    <div key={index} className="text-sm text-secondary-600 bg-secondary-50 p-2 rounded-md">
                      {index + 1}. {request}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <label htmlFor="refinement" className="text-sm font-medium text-secondary-700">
                  רוצה לשפר את המתכון? ספר לי איך
                </label>
                <span className="text-sm text-secondary-500">
                  {refinementCount}/3 שיפורים
                </span>
              </div>
              <Input
                id="refinement"
                value={refinementRequest}
                onChange={(e) => setRefinementRequest(e.target.value)}
                placeholder="לדוגמה: תוסיף יותר ירקות, הפוך אותו לטבעוני, הפחת את הכמויות..."
                className="w-full"
                disabled={refinementCount >= 3}
              />
            </div>
            <div className="flex justify-between gap-3">
              <Button
                variant="secondary"
                onClick={handleCancel}
                className="flex-1"
              >
                מתכון חדש
              </Button>
              <Button
                variant="primary"
                onClick={handleRefinementSubmit}
                isLoading={loadingRecipe}
                disabled={!refinementRequest.trim() || refinementCount >= 3}
                className="flex-1"
              >
                שפר מתכון {refinementCount < 3 ? "" : "(הגעת למקסימום)"}
              </Button>
              {authState.canEdit && (
                <Button
                  variant="primary"
                  onClick={() => saveRecipe({
                    newText: recipeText,
                    image: recipe.image_url,
                  })}
                  isLoading={savingRecipe}
                  disabled={recipeText === savedText}
                  className="flex-1"
                >
                  {recipeText === savedText ? "נשמר ✓" : "שמור מתכון"}
                </Button>
              )}
            </div>
            {saveMessage && (
              <TypingEffect message={saveMessage} onComplete={() => setSaveMessage(null)} />
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Meal Type Selection */}
          <div className="space-y-1.5">
            <label htmlFor="mealType" className="block text-sm font-medium text-secondary-700">
              סוג הארוחה
            </label>
            <select
              required
              id="mealType"
              value={mealType}
              onChange={handleMealTypeChange}
              className="w-full px-3 py-2 text-secondary-900 bg-white border border-secondary-200 
                       rounded-lg focus:ring-2 focus:ring-primary-100 focus:border-primary-300
                       transition-colors duration-200"
            >
              <option value="ארוחת בוקר">ארוחת בוקר</option>
              <option value="ארוחת צהריים">ארוחת צהריים</option>
              <option value="ארוחת ערב">ארוחת ערב</option>
              <option value="חטיף">חטיף</option>
            </select>
          </div>

          {/* Preferences */}
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 px-3 py-1.5 bg-secondary-50 rounded-lg
                           hover:bg-secondary-100 transition-colors duration-200 cursor-pointer">
              <input
                type="checkbox"
                checked={quickPrep}
                onChange={(e) => setQuickPrep(e.target.checked)}
                className="w-4 h-4 text-primary-500 border-secondary-300 rounded
                         focus:ring-primary-500 transition-colors duration-200"
              />
              <span className="text-sm text-secondary-700">הכנה מהירה</span>
            </label>
            <label className="flex items-center gap-2 px-3 py-1.5 bg-secondary-50 rounded-lg
                           hover:bg-secondary-100 transition-colors duration-200 cursor-pointer">
              <input
                type="checkbox"
                checked={childFriendly}
                onChange={(e) => setChildFriendly(e.target.checked)}
                className="w-4 h-4 text-primary-500 border-secondary-300 rounded
                         focus:ring-primary-500 transition-colors duration-200"
              />
              <span className="text-sm text-secondary-700">ידידותי לילדים</span>
            </label>
          </div>

          {/* Ingredients Input */}
          <div className="space-y-1.5">
            <label htmlFor="ingredients" className="block text-sm font-medium text-secondary-700">
              רכיבים זמינים
            </label>
            <input
              type="text"
              id="ingredients"
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder="הכנס רכיבים מופרדים בפסיקים"
              className="w-full px-3 py-2 text-secondary-900 bg-white border border-secondary-200 
                       rounded-lg focus:ring-2 focus:ring-primary-100 focus:border-primary-300
                       transition-colors duration-200"
            />
          </div>

          {/* Additional Requests */}
          <div className="space-y-1.5">
            <label htmlFor="additionalRequests" className="block text-sm font-medium text-secondary-700">
              בקשות נוספות
            </label>
            <textarea
              id="additionalRequests"
              value={additionalRequests}
              onChange={(e) => setAdditionalRequests(e.target.value)}
              placeholder="הכנס כל בקשה או העדפה נוספת כאן"
              rows={2}
              className="w-full px-3 py-2 text-secondary-900 bg-white border border-secondary-200 
                       rounded-lg focus:ring-2 focus:ring-primary-100 focus:border-primary-300
                       transition-colors duration-200 resize-none"
            />
          </div>

          {/* Photo Option */}
          <label className="flex items-center gap-2 px-3 py-1.5 bg-secondary-50 rounded-lg
                         hover:bg-secondary-100 transition-colors duration-200 cursor-pointer">
            <input
              type="checkbox"
              checked={photoRequested}
              onChange={(e) => setPhotoRequested(e.target.checked)}
              className="w-4 h-4 text-primary-500 border-secondary-300 rounded
                       focus:ring-primary-500 transition-colors duration-200"
            />
            <span className="text-sm text-secondary-700">הוסף תמונה להצעה</span>
          </label>

          {/* Progress Indicator for Recipe Generation */}
          {loadingRecipe && (
            <div className="bg-gradient-to-br from-primary-50 to-white rounded-lg p-4 shadow-sm border border-primary-200">
              <ProgressIndicator
                steps={recipeProgress.steps}
                currentStepIndex={recipeProgress.currentStepIndex}
                variant="steps"
                showEstimatedTime={true}
              />
            </div>
          )}

          {/* Submit Button */}
          <FeatureIndicator
            featureId="ai-recipe"
            className="w-2 h-2"
          >
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={loadingRecipe}
              className="w-full"
            >
              קבל הצעת מתכון
            </Button>
          </FeatureIndicator>

          {error && (
            <div className="mt-3 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg">
              {error}
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default MealSuggestionForm;