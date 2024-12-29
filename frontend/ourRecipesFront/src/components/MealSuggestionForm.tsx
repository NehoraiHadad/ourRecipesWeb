import React, { useState, ChangeEvent } from "react";
import Spinner from "@/components/ui/Spinner";
import RecipeDisplay from "./RecipeDisplay";
import { parseRecipe } from "../utils/formatChecker";
import { useAuthContext } from "../context/AuthContext";
import { useNotification } from '@/context/NotificationContext'
import { Button } from '@/components/ui/Button'

type MealType = "ארוחת בוקר" | "ארוחת צהריים" | "ארוחת ערב" | "חטיף";

const MealSuggestionForm: React.FC = () => {
  const { authState } = useAuthContext();
  const [ingredients, setIngredients] = useState<string>("");
  const [mealType, setMealType] = useState<MealType>("ארוחת בוקר");
  const [quickPrep, setQuickPrep] = useState<boolean>(false);
  const [childFriendly, setChildFriendly] = useState<boolean>(false);
  const [additionalRequests, setAdditionalRequests] = useState<string>("");
  const [photoRequested, setPhotoRequested] = useState<boolean>(false);
  const [recipe, setRecipe] = useState<{
    id?: number;
    title?: string;
    ingredients?: string[];
    instructions?: string;
    image?: string;
    categories?: string[];
    preparation_time?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
  } | null>(null);
  const [loadingRecipe, setLoadingRecipe] = useState<boolean>(false);
  const [loadingPhoto, setLoadingPhoto] = useState<boolean>(false);
  const [recipeText, setRecipeText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const { addNotification } = useNotification()

  const fetchRecipe = async () => {
    setLoadingRecipe(true);
    setError("");
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/suggest`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ingredients,
            mealType,
            quickPrep,
            childFriendly,
            additionalRequests,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch the recipe");
      }

      const result = await response.json();
      if (result.message) {
        setRecipeText(result.message);
        const parsedRecipe = parseRecipe(result.message);
        console.log(parsedRecipe);
        setRecipe({
          title: parsedRecipe.title,
          ingredients: parsedRecipe.ingredients,
          instructions: parsedRecipe.instructions,
          categories: parsedRecipe.categories,
          preparation_time: parsedRecipe.preparation_time,
          difficulty: parsedRecipe.difficulty,
        });

        // Fetch photo if requested
        if (photoRequested) {
          fetchPhoto(result.message);
        }
      } else {
        throw new Error("No recipe received");
      }
    } catch (error: any) {
      setError(error.message);
      setRecipe(null);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const fetchPhoto = async (recipeText: string) => {
    setLoadingPhoto(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/generate-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ recipeContent: recipeText }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch the photo");
      }

      const result = await response.json();
      setRecipe((prevRecipe) => ({ ...prevRecipe, image: result.image }));
    } catch (error: any) {
      setError(error.message); // Optionally handle photo error separately
    } finally {
      setLoadingPhoto(false);
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
  };

  const sendToTelegram = async (data: {}) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/send_recipe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update the recipe in Telegram.");
      }

      const result = await response.json();
      console.log("Update successful:", result);
      // setShowMessage({ status: true, message: "המתכון נשמר בהצלחה" });
    } catch (error) {
      console.error("Error updating recipe:", error);
      // setShowMessage({ status: true, message: "שגיאה בשמירת המתכון" });
      throw error;
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="w-full">
      {recipe && recipe.title && recipe.ingredients && recipe.instructions ? (
        <div className="space-y-4">
          {loadingPhoto && (
            <div className="flex items-center justify-center">
              <Spinner message="מייצר תמונה..." />
            </div>
          )}
          <RecipeDisplay recipe={{ ...recipe, id: 0 } as Required<typeof recipe>} />
          <div className="flex justify-between gap-3">
            <Button
              variant="secondary"
              onClick={handleCancel}
              className="flex-1"
            >
              הצעה חדשה
            </Button>
            {authState.canEdit && (
              <Button
                variant="primary"
                onClick={() => sendToTelegram({
                  newText: recipeText,
                  image: recipe.image,
                })}
                isLoading={loading}
                className="flex-1"
              >
                שמור בטלגרם
              </Button>
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

          {/* Submit Button */}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loadingRecipe}
            className="w-full"
          >
            קבל הצעת מתכון
          </Button>

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