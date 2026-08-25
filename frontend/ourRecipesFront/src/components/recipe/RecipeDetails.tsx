import React, { useEffect, useState } from "react";
import { Difficulty, recipe } from "@/types";
import { useAuthContext } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { isRecipeUpdated, parseRecipe } from "@/utils/formatChecker";
import TypingEffect from "@/components/TypingEffect";
import RecipeDisplay from "@/components/RecipeDisplay";
import { RecipeEditForm } from './RecipeEditForm';
import { Typography } from '@/components/ui/Typography';
import { difficultyDisplay } from '@/utils/difficulty';
import VersionHistory from '@/components/VersionHistory';
import { useRecipeHistory } from '@/contexts/RecipeHistoryContext';
import { ActiveTimers } from './ActiveTimers';
import RecipeStepOptimizer from './RecipeStepOptimizer';
import { apiService } from '@/services/apiService';
import { RecipeService } from '@/services/recipeService';
import { VersionService } from '@/services/versionService';


interface RecipeDetailProps {
  recipe: recipe;
  isEditing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
}

interface UpdateRecipeData {
  messageId: number;
  newText: string;
}

/** AI routes (reformat / infographic) take far longer than the default timeout. */
const AI_TIMEOUT = 180000;

const RecipeDetails: React.FC<RecipeDetailProps> = ({ 
  recipe, 
  isEditing, 
  onEditStart, 
  onEditEnd 
}) => {
  const { addToRecentlyViewed } = useRecipeHistory();
  const [showMessage, setShowMessage] = useState({
    status: false,
    message: "",
  });
  const { authState } = useAuthContext();
  const [newFormat, setNewFormat] = useState(false);
  const [reformat_recipe, setReformat_recipe] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [generatedInfographic, setGeneratedInfographic] = useState<string | null>(null);
  const [isGeneratingInfographic, setIsGeneratingInfographic] = useState(false);
  const [recipeData, setRecipeData] = useState<{
    id: number;
    telegram_id: number;
    title: string;
    ingredients: string[] | string;
    instructions: string;
    raw_content?: string;
    image: string | null;
    categories?: string[];
    preparation_time?: number;
    difficulty?: Difficulty;
  } | null>(null);
  const [showTimer, setShowTimer] = useState(false);

  useEffect(() => {
    if (isRecipeUpdated(recipe.title + "\n" + recipe.details)) {
      const formattedRecipe = parseRecipe(recipe.title + "\n" + recipe.details);
      setRecipeData({
        id: recipe.id,
        telegram_id: recipe.telegram_id,
        ...formattedRecipe,
        image: recipe.image || null,
        categories: formattedRecipe.categories || [],
        difficulty: formattedRecipe.difficulty
      });
      setNewFormat(true);
    } else {
      setRecipeData({
        id: recipe.id,
        telegram_id: recipe.telegram_id,
        title: recipe.title,
        ingredients: [],
        instructions: recipe.details,
        image: recipe.image || null,
        categories: [],
        difficulty: undefined
      });
    }
  }, [recipe]);

  useEffect(() => {
    // Track recipe view only when the recipe first loads
    console.log('Recipe changed:', { telegram_id: recipe?.telegram_id, title: recipe?.title });
    console.log('RecipeData:', recipeData);
    
    if (recipeData?.id && recipeData?.title) {
      const currentTime = new Date().getTime();
      const lastViewTime = localStorage.getItem(`last_view_${recipeData.id}`);
      
      console.log('Checking view time:', {
        currentTime,
        lastViewTime,
        timeDiff: lastViewTime ? currentTime - parseInt(lastViewTime) : 'first view'
      });
      
      // Only track if haven't viewed in the last minute
      if (!lastViewTime || currentTime - parseInt(lastViewTime) > 60000) {
        console.log('Adding to recently viewed:', {
          id: recipeData.telegram_id,
          title: recipeData.title
        });

        localStorage.setItem(`last_view_${recipeData.telegram_id}`, currentTime.toString());
        addToRecentlyViewed({
          id: recipeData.telegram_id,
          title: recipeData.title
        });
      } else {
        console.log('Skipping view tracking - viewed too recently');
      }
    }
  }, [recipeData?.telegram_id, recipeData?.title, addToRecentlyViewed]);

  const fetchReformattedRecipe = async () => {
    setIsLoading(true);
    try {
      // `POST /api/recipes/reformat` answers `{ data: { message } }`.
      const response = await apiService.post<{ data: { message: string } }>(
        "/api/recipes/reformat",
        { text: recipe.title + "\n" + recipe.details },
        { timeout: AI_TIMEOUT }
      );

      const reformattedText = response?.data?.message;
      if (!reformattedText) {
        throw new Error("No reformatted text returned");
      }

      setReformat_recipe(reformattedText);
      const formattedRecipe = parseRecipe(reformattedText);
      setRecipeData({
        id: recipe.id,
        telegram_id: recipe.telegram_id,
        ...formattedRecipe,
        image: recipe.image || null,
      });
      setNewFormat(true);
    } catch (error: any) {
      setShowMessage({ status: true, message: "שגיאה בעיבוד המתכון" });
    } finally {
      setIsLoading(false);
    }
  };

  const generateInfographic = async () => {
    console.log("[INFOGRAPHIC] Starting infographic generation...");
    setIsGeneratingInfographic(true);
    setShowMessage({ status: false, message: "" });
    try {
      const recipeContent = recipe.title + "\n" + recipe.details;
      console.log("[INFOGRAPHIC] Recipe content length:", recipeContent.length);

      // `POST /api/recipes/generate-infographic` answers
      // `{ data: { image: "data:image/png;base64,..." } }`.
      const response = await apiService.post<{ data: { image: string } }>(
        "/api/recipes/generate-infographic",
        { recipeContent },
        { timeout: AI_TIMEOUT }
      );

      const image = response?.data?.image;
      if (!image) {
        throw new Error("No infographic returned");
      }

      setGeneratedInfographic(image);
      setShowMessage({ status: true, message: "האינפוגרפיקה נוצרה בהצלחה!" });
    } catch (error: any) {
      console.error("[INFOGRAPHIC] Error generating infographic:", error);
      console.error("[INFOGRAPHIC] Error stack:", error.stack);
      setShowMessage({
        status: true,
        message: `שגיאה ביצירת אינפוגרפיקה: ${error.message || "נסה שוב מאוחר יותר"}`
      });
    } finally {
      console.log("[INFOGRAPHIC] Finished infographic generation process");
      setIsGeneratingInfographic(false);
    }
  };

  const handleEditClick = () => {
    onEditStart();
  };

  const handleComplete = () => {
    setShowMessage({ status: false, message: "" });
  };

  const buildRecipeText = (recipeData: recipe): string => {
    return `כותרת: ${recipeData.title || ""}
${recipeData.categories?.length ? `\nקטגוריות: ${recipeData.categories.join(", ")}` : ""}
${recipeData.preparation_time ? `\nזמן הכנה: ${recipeData.preparation_time} דקות` : ""}
${recipeData.difficulty ? `\nרמת קושי: ${difficultyDisplay[recipeData.difficulty as keyof typeof difficultyDisplay]}` : ""}
\nרשימת מצרכים:\n-${Array.isArray(recipeData.ingredients)
  ? recipeData.ingredients.join("\n-")
  : recipeData.ingredients}
\nהוראות הכנה:\n${Array.isArray(recipeData.instructions)
  ? recipeData.instructions.join('\n')
  : (recipeData.instructions || recipeData.details || "")}`;
  };

  const handleSaveManualEdit = async (updatedData: recipe) => {
    try {
      // Build the formatted text
      const formattedText = buildRecipeText(updatedData);

      // Update the recipe in Telegram and DB
      setIsLoading(true);
      await updateRecipeInTelegram({
        messageId: recipe.telegram_id,
        newText: formattedText,
      });

      // Update local state
      setRecipeData({
        id: updatedData.id,
        telegram_id: updatedData.telegram_id || recipe.telegram_id,
        title: updatedData.title,
        ingredients: updatedData.ingredients || [],
        instructions: Array.isArray(updatedData.instructions)
          ? updatedData.instructions.join('\n')
          : (updatedData.instructions || updatedData.details || ""),
        image: updatedData.image || null,
        categories: updatedData.categories || [],
        preparation_time: updatedData.preparation_time,
        difficulty: updatedData.difficulty
      });

      setNewFormat(true);
      onEditEnd();
    } catch (error) {
      console.error("Error saving manual edit:", error);
      // Don't close the edit form if save failed
    }
  };

  const updateRecipeInTelegram = async (data: UpdateRecipeData) => {
    setIsLoading(true);
    try {
      // `PUT /api/recipes/:telegram_id` answers with the updated recipe itself
      // (same serialization as `GET`), not Flask's `{status, new_message_id}`.
      const result = await RecipeService.updateRecipe(data.messageId, {
        newText: data.newText,
        image: recipeData?.image,
      });

      setShowMessage({ status: true, message: "המתכון נשמר בהצלחה" });
      return result;
    } catch (error: any) {
      const errorMessage = error.message?.toLowerCase().includes("not modified")
        ? "לא בוצעו שינויים במתכון"
        : "שגיאה בשמירת המתכון";
      setShowMessage({ status: true, message: errorMessage });
      throw error;
    } finally {
      setReformat_recipe("");
      setIsLoading(false);
    }
  };

  const handleVersionRestore = async (versionId: number) => {
    setIsLoading(true);
    try {
      // Flat `{ message, title, details, image }` body.
      const restoredRecipe = await VersionService.restoreVersion(
        recipe.telegram_id,
        versionId
      );
      const restoredTitle = restoredRecipe.title ?? "";
      const restoredDetails = restoredRecipe.details ?? "";

      // Update the recipe data with the restored version
      if (isRecipeUpdated(restoredTitle + "\n" + restoredDetails)) {
        const formattedRecipe = parseRecipe(restoredTitle + "\n" + restoredDetails);
        setRecipeData({
          id: recipe.id,
          telegram_id: recipe.telegram_id,
          ...formattedRecipe,
          image: restoredRecipe.image || null,
          categories: formattedRecipe.categories || [],
          difficulty: formattedRecipe.difficulty
        });
        setNewFormat(true);
      } else {
        setRecipeData({
          id: recipe.id,
          telegram_id: recipe.telegram_id,
          title: restoredTitle,
          ingredients: [],
          instructions: restoredDetails,
          image: restoredRecipe.image || null,
          categories: [],
          difficulty: undefined
        });
      }
      setShowVersionHistory(false);
      setShowMessage({ status: true, message: "הגרסה שוחזרה בהצלחה" });
    } catch (error) {
      console.error("Error restoring version:", error);
      setShowMessage({ status: true, message: "שגיאה בשחזור הגרסה" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="max-w-4xl mx-auto bg-white rounded-2xl overflow-hidden">
        {/* Recipe Content */}
        <div className="relative">
          {!isEditing ? (
            <>
              {recipeData && (
                <RecipeDisplay 
                  recipe={recipeData as recipe} 
                  onPrepTimeClick={() => setShowTimer(prev => !prev)}
                  showTimer={showTimer}
                />
              )}
            </>
          ) : (
            // Edit mood 
            <RecipeEditForm
              recipeData={{
                ...recipeData,
                telegram_id: recipe.telegram_id,
                details: recipe.details,
                is_parsed: recipe.is_parsed,
                parse_errors: recipe.parse_errors,
                created_at: recipe.created_at,
                difficulty: recipeData?.difficulty,
                ingredients: recipeData?.ingredients || [],
                preparation_time: recipeData?.preparation_time,
                categories: recipeData?.categories || [],
              } as recipe}
              onSave={handleSaveManualEdit}
              onCancel={onEditEnd}
            />
          )}
        </div>

        {/* Add this after the recipe instructions section */}
        <div className="mt-4">
          <RecipeStepOptimizer recipeText={recipe.details} />
        </div>

        {/* Action Buttons Container - Only show when not editing */}
        {!isEditing && (
          <div className="p-6">
            {/* Edit Controls - AI and Manual Edit */}
            {authState.canEdit && reformat_recipe === "" && (
              <div className="flex flex-col gap-4">
                <div className="flex justify-center gap-4">
                  <Button
                    variant="primary"
                    onClick={fetchReformattedRecipe}
                    isLoading={isLoading}
                    className="flex items-center gap-2 shadow-warm hover:shadow-lg transition-all"
                  >
                    <Typography variant="body" className="font-handwriting-amit">AI</Typography>
                    <Typography variant="h3" className="text-lg">✨</Typography>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleEditClick}
                    className="shadow-warm hover:shadow-lg transition-all"
                  >
                    <Typography variant="body" className="font-handwriting-amit">עריכה ידנית</Typography>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowVersionHistory(true)}
                    className="shadow-warm hover:shadow-lg transition-all"
                  >
                    <Typography variant="body" className="font-handwriting-amit">היסטוריית גרסאות</Typography>
                  </Button>
                </div>

                {/* Infographic Generation Button */}
                <div className="flex justify-center">
                  <Button
                    variant="primary"
                    onClick={generateInfographic}
                    isLoading={isGeneratingInfographic}
                    disabled={isGeneratingInfographic}
                    className="flex items-center gap-2 shadow-warm hover:shadow-lg transition-all"
                  >
                    <Typography variant="body" className="font-handwriting-amit">
                      {isGeneratingInfographic ? "יוצר אינפוגרפיקה..." : "צור אינפוגרפיקה"}
                    </Typography>
                    <Typography variant="h3" className="text-lg">🎨</Typography>
                  </Button>
                </div>
              </div>
            )}

            {/* Version History Modal */}
            {showVersionHistory && (
              <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                  <VersionHistory
                    recipeId={recipe.telegram_id}
                    onRestore={handleVersionRestore}
                    onClose={() => setShowVersionHistory(false)}
                  />
                </div>
              </div>
            )}

            {/* Save/Cancel Controls for AI edits */}
            {authState.canEdit && reformat_recipe && !isLoading && (
              <div className="flex justify-center gap-4">
                <Button
                  variant="primary"
                  onClick={() => updateRecipeInTelegram({
                    messageId: recipe.telegram_id,
                    newText: reformat_recipe,
                  })}
                  className="shadow-warm hover:shadow-lg transition-all"
                >
                  <Typography variant="body" className="font-handwriting-amit">שמור</Typography>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!isRecipeUpdated(recipe.title + "\n" + recipe.details)) {
                      setNewFormat(false);
                    }
                    setReformat_recipe("");
                  }}
                  className="shadow-warm hover:shadow-lg transition-all"
                >
                  <Typography variant="body" className="font-handwriting-amit">בטל</Typography>
                </Button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && reformat_recipe && (
              <div className="flex justify-center">
                <Spinner message="מעבד את המתכון..." />
              </div>
            )}

            {/* Status Message */}
            {showMessage.status && (
              <div className="mt-4 text-center">
                <Typography variant="body">
                  <TypingEffect
                    message={showMessage.message}
                    onComplete={handleComplete}
                  />
                </Typography>
              </div>
            )}

            {/* Generated Infographic Display */}
            {generatedInfographic && (
              <div className="mt-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <Typography variant="h3" className="font-handwriting-amit">
                      אינפוגרפיקה שנוצרה
                    </Typography>
                    <button
                      onClick={() => setGeneratedInfographic(null)}
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                      aria-label="סגור"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="relative w-full rounded-lg overflow-hidden shadow-lg">
                    <img
                      src={generatedInfographic}
                      alt="אינפוגרפיקה למתכון"
                      className="w-full h-auto"
                    />
                  </div>
                  <div className="mt-4 flex justify-center gap-4">
                    <a
                      href={generatedInfographic}
                      download={`${recipeData?.title || 'recipe'}-infographic.png`}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <Typography variant="body" className="font-handwriting-amit">
                        הורד תמונה
                      </Typography>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Timers */}
      <ActiveTimers />
    </>
  );
};

export default RecipeDetails; 