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

const RecipeDetails: React.FC<RecipeDetailProps> = ({ 
  recipe, 
  isEditing, 
  onEditStart, 
  onEditEnd 
}) => {
  const [showMessage, setShowMessage] = useState({
    status: false,
    message: "",
  });
  const { authState } = useAuthContext();
  const [newFormat, setNewFormat] = useState(false);
  const [reformat_recipe, setReformat_recipe] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [recipeData, setRecipeData] = useState<{
    id: number;
    title: string;
    ingredients: string[] | string;
    instructions: string;
    raw_content?: string;
    image: string | null;
    categories?: string[];
    preparation_time?: number;
    difficulty?: Difficulty;
  } | null>(null);

  useEffect(() => {
    if (isRecipeUpdated(recipe.title + "\n" + recipe.details)) {
      const formattedRecipe = parseRecipe(recipe.title + "\n" + recipe.details);
      setRecipeData({
        id: recipe.id,
        ...formattedRecipe,
        image: recipe.image || null,
        categories: formattedRecipe.categories || [],
        difficulty: formattedRecipe.difficulty
      });
      setNewFormat(true);
    } else {
      setRecipeData({
        id: recipe.id,
        title: recipe.title,
        ingredients: [],
        instructions: recipe.details,
        image: recipe.image || null,
        categories: [],
        difficulty: undefined
      });
    }
  }, [recipe]);

  const fetchReformattedRecipe = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/reformat_recipe`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: recipe.title + "\n" + recipe.details }),
        }
      );
      const data = await response.json();
      if (response.ok) {
        setReformat_recipe(data.reformatted_text);
        const formattedRecipe = parseRecipe(data.reformatted_text);
        setRecipeData({
          id: recipe.id,
          ...formattedRecipe,
          image: recipe.image || null,
        });
        setNewFormat(true);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setShowMessage({ status: true, message: "שגיאה בעיבוד המתכון" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = () => {
    onEditStart();
  };

  const handleComplete = () => {
    setShowMessage({ status: false, message: "" });
  };

  const handleSaveManualEdit = (updatedData: recipe) => {
    setRecipeData({
      id: updatedData.id,
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

    setReformat_recipe(
      `כותרת: ${updatedData.title || ""}
${updatedData.categories?.length ? `\nקטגוריות: ${updatedData.categories.join(", ")}` : ""}
${updatedData.preparation_time ? `\nזמן הכנה: ${updatedData.preparation_time} דקות` : ""}
${updatedData.difficulty ? `\nרמת קושי: ${difficultyDisplay[updatedData.difficulty as keyof typeof difficultyDisplay]}` : ""}
\nרשימת מצרכים:\n-${Array.isArray(updatedData.ingredients) 
  ? updatedData.ingredients.join("\n-") 
  : updatedData.ingredients}
\nהוראות הכנה:\n${updatedData.instructions || updatedData.details || ""}`
    );
    
    setNewFormat(true);
    onEditEnd();
  };

  const updateRecipeInTelegram = async (data: UpdateRecipeData) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/update/${data.messageId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            newText: data.newText,
            image: recipeData?.image,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update the recipe in Telegram.");
      }

      const result = await response.json();
      if (result.new_message_id) {
        recipe.id = result.new_message_id;
      }
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
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/versions/restore/${versionId}`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      
      if (!response.ok) {
        throw new Error("Failed to restore version");
      }
      
      const restoredRecipe = await response.json();
      // Update the recipe data with the restored version
      if (isRecipeUpdated(restoredRecipe.title + "\n" + restoredRecipe.details)) {
        const formattedRecipe = parseRecipe(restoredRecipe.title + "\n" + restoredRecipe.details);
        setRecipeData({
          id: recipe.id,
          ...formattedRecipe,
          image: restoredRecipe.image || null,
          categories: formattedRecipe.categories || [],
          difficulty: formattedRecipe.difficulty
        });
        setNewFormat(true);
      } else {
        setRecipeData({
          id: recipe.id,
          title: restoredRecipe.title,
          ingredients: [],
          instructions: restoredRecipe.details,
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
    <div className="max-w-4xl mx-auto bg-white rounded-2xl overflow-hidden">
      {/* Recipe Content */}
      <div className="relative">
        {!isEditing ? (
          recipeData && <RecipeDisplay recipe={recipeData as recipe} />
        ) : (
          // מצב עריכה
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

      {/* Action Buttons Container - Only show when not editing */}
      {!isEditing && (
        <div className="p-6">
          {/* Edit Controls - AI and Manual Edit */}
          {authState.canEdit && reformat_recipe === "" && (
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
          )}

          {/* Version History Modal */}
          {showVersionHistory && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
              <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <VersionHistory
                  recipeId={recipe.id}
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
                  messageId: recipe.id,
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
        </div>
      )}
    </div>
  );
};

export default RecipeDetails; 