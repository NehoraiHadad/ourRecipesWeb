import React, { useState, ChangeEvent } from "react";
import Spinner from "./Spinner";
import RecipeDisplay from "./RecipeDisplay";
import { parseRecipe } from "../utils/formatChecker";
import { useAuthContext } from "@/context/AuthContext";

type MealType = "ארוחת בוקר" | "ארוחת צהריים" | "ארוחת ערב" | "חטיף";

const MealSuggestionForm: React.FC = () => {
  const { authState } = useAuthContext();
  const [ingredients, setIngredients] = useState<string>("");
  const [mealType, setMealType] = useState<MealType[]>(["ארוחת בוקר"]);
  const [quickPrep, setQuickPrep] = useState<boolean>(false);
  const [childFriendly, setChildFriendly] = useState<boolean>(false);
  const [additionalRequests, setAdditionalRequests] = useState<string>("");
  const [photo, setPhoto] = useState<boolean>(false);
  const [recipeText, setRecipeText] = useState<string>("");
  const [recipe, setRecipe] = useState<{
    title: string;
    ingredients: string[];
    instructions: string;
    image: string;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/meal-suggestions`,
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
            photo,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to submit the form");
      }

      const result = await response.json();
      const result_photo = result.photo ? result.photo : "";
      console.log(result);
      console.log(result.photo);
      if (result.message !== "") {
        setRecipeText(result.message);
        const recipeData = parseRecipe(result.message);
        setRecipe({
          title: recipeData.title,
          ingredients: recipeData.ingredients,
          instructions: recipeData.instructions,
          image: result_photo,
        });
      } else {
        throw new Error("שגיאה - לא התקבל מתכון");
      }
    } catch (error: any) {
      setError(error.message);
      setRecipe(null);
    } finally {
      setLoading(false);
    }
  };

  const handleMealTypeChange = (
    event: ChangeEvent<HTMLSelectElement>
  ): void => {
    const selectedOptions = Array.from(
      event.target.selectedOptions,
      (option) => option.value as MealType
    );
    setMealType(selectedOptions);
  };

  const handleCancel = () => {
    setIngredients("");
    setMealType(["ארוחת בוקר"]);
    setQuickPrep(false);
    setChildFriendly(false);
    setAdditionalRequests("");
    setPhoto(false);
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
    <div>
      {recipe && recipe.title ? (
        <div>
          <RecipeDisplay recipe={recipe} />
          {loading ? <Spinner message="שולח.." ></Spinner> : 
            <div className="flex justify-between">
              <button
                onClick={handleCancel}
                className="mt-4 px-4 py-2 bg-gray-500 text-white font-bold rounded hover:bg-gray-700"
              >
                פתח הצעה חדשה
              </button>
              {authState.canEdit && (
                <button
                  onClick={() =>
                    sendToTelegram({
                      newText: recipeText,
                      image: recipe.image,
                    })
                  }
                  className="mt-4 px-4 py-2 bg-green-500 hover:bg-green-700 text-white font-bold rounded "
                >
                  שמור בטלגרם
                </button>
              )}
            </div>
          }
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-2 bg-white">
          <div className="mb-4">
            <label
              htmlFor="mealType"
              className="block text-sm font-medium text-gray-700"
            >
              סוג הארוחה:
            </label>
            <select
              required
              id="mealType"
              value={mealType}
              onChange={handleMealTypeChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 overflow-hidden"
            >
              <option value="ארוחת בוקר">ארוחת בוקר</option>
              <option value="ארוחת צהריים">ארוחת צהריים</option>
              <option value="ארוחת ערב">ארוחת ערב</option>
              <option value="חטיף">חטיף</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={quickPrep}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setQuickPrep(e.target.checked)
                }
                className="form-checkbox h-5 w-5 text-indigo-600 ml-1"
              />
              <span className="ml-2 text-gray-700">הכנה מהירה</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={childFriendly}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setChildFriendly(e.target.checked)
                }
                className="form-checkbox h-5 w-5 text-indigo-600 ml-1"
              />
              <span className="ml-2 text-gray-700">ידידותי לילדים</span>
            </label>
          </div>
          <div className="mb-4">
            <label
              htmlFor="ingredients"
              className="block text-sm font-medium text-gray-700"
            >
              רכיבים:
            </label>
            <input
              type="text"
              id="ingredients"
              value={ingredients}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setIngredients(e.target.value)
              }
              placeholder="הכנס רכיבים מופרדים בפסיקים"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="mb-4">
            <label
              htmlFor="additionalRequests"
              className="block text-sm font-medium text-gray-700"
            >
              בקשות נוספות:
            </label>
            <textarea
              id="additionalRequests"
              value={additionalRequests}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setAdditionalRequests(e.target.value)
              }
              placeholder="הכנס כל בקשה או העדפה נוספת כאן"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
            />
          </div>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={photo}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setPhoto(e.target.checked)
              }
              className="form-checkbox h-5 w-5 text-indigo-600 ml-1"
            />
            <span className="ml-2 text-gray-700">מה עם תמונה?</span>
          </label>
          <div className="flex flex-row justify-center">
            {!loading ? (
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white font-bold rounded hover:bg-blue-700"
              >
                שלח הצעה
              </button>
            ) : (
              <Spinner message="עובדים על זה..."></Spinner>
            )}
          </div>
          {error && <p className="text-red-500">{error}</p>}
        </form>
      )}
    </div>
  );
};

export default MealSuggestionForm;
