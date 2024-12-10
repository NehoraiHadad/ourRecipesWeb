import React, { useEffect, useState } from "react";
import { recipe } from "../types";
import { useAuthContext } from "../context/AuthContext";
import Spinner from "./Spinner";
import { isRecipeUpdated, parseRecipe } from "../utils/formatChecker";
import TypingEffect from "./TypingEffect";
import EditRecipeModal from "./EditRecipeModal";
import RecipeDisplay from "./RecipeDisplay";

interface RecipeDetailProps {
  recipe: recipe;
}

interface UpdateRecipeData {
  messageId: number;
  newText: string;
}

const RecipeDetail: React.FC<RecipeDetailProps> = ({ recipe }) => {
  const [showMessage, setShowMessage] = useState({
    status: false,
    message: "",
  });

  const { authState } = useAuthContext();

  const [newFormat, setNewFormat] = useState(false);
  const [reformat_recipe, setReformat_recipe] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [recipeData, setRecipeData] = useState<{
    id: number;
    title: string;
    ingredients: string[] | string;
    instructions?: string;
    raw_content?: string;
    image: string | null;
    categories?: string[];
  } | null>(null);
  const [editManualModal, setEditManualModal] = useState(false);

  useEffect(() => {
    if (isRecipeUpdated(recipe.title + "\n" + recipe.details)) {
      const formattedRecipe = parseRecipe(recipe.title + "\n" + recipe.details);
      setRecipeData({
        id: recipe.id,
        ...formattedRecipe,
        image: recipe.image || null,
        categories: formattedRecipe.categories || []
      });
      setNewFormat(true);
    } else {
      setRecipeData({
        id: recipe.id,
        title: recipe.title,
        ingredients: [],
        instructions: recipe.details,
        image: recipe.image || null,
        categories: []
      });
    }
  }, [recipe]);

  const fetchReformattedRecipe = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/reformat_recipe`,
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
          image: recipe.image || null 
        });
        setNewFormat(true);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      alert("Failed to fetch reformatted recipe: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateRecipeInTelegram = async (data: UpdateRecipeData) => {
    setIsLoading(true);
    try {
      let imageData = null;
      if (recipeData?.image) {
        imageData = recipeData.image;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/update/${data.messageId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          credentials: "include",
          body: JSON.stringify({
            newText: data.newText,
            image: imageData,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update the recipe in Telegram.");
      }

      const result = await response.json();
      console.log("Update successful:", result);
      if (result.new_message_id) {
        recipe.id = result.new_message_id;
      }
      setShowMessage({ status: true, message: "המתכון נשמר בהצלחה" });
      return result;
    } catch (error: any) {
      console.error("Error updating recipe:", error);
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

  const handleComplete = () => {
    setShowMessage({ status: false, message: "" });
  };

  const handleSaveManualEdit = () => {
    setReformat_recipe(
      `כותרת: ${recipeData?.title || ""}
${recipeData?.categories?.length ? `\nקטגוריות: ${recipeData.categories.join(', ')}` : ''}
\nרשימת מצרכים:\n-${Array.isArray(recipeData?.ingredients) ? recipeData.ingredients.join("\n-") : recipeData?.ingredients}
\nהוראות הכנה:\n${recipeData?.instructions || ""}`
    );

    setNewFormat(true);
    setEditManualModal(false);
  };

  return (
    <div>
      {recipeData && (
        <RecipeDisplay recipe={recipeData} />
      )}
      {authState.canEdit && reformat_recipe == "" && (
        <div>
          {isLoading ? (
            <Spinner message="טוען..."></Spinner>
          ) : (
            <div className="flex justify-around">
              <button
                onClick={fetchReformattedRecipe}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                disabled={isLoading}
              >
                AI✨ 
              </button>
              <button
                onClick={() => setEditManualModal(true)}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                עריכה ידנית
              </button>
            </div>
          )}
        </div>
      )}
      {authState.canEdit && reformat_recipe && !isLoading ? (
        <div className="flex justify-around">
          <button
            onClick={() =>
              updateRecipeInTelegram({
                messageId: recipe.id,
                newText: reformat_recipe,
              })
            }
            className="w-2/5 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            שמור בטלגרם
          </button>
          <button
            onClick={() => {
              if (!isRecipeUpdated(recipe.title + "\n" + recipe.details)) {
                setNewFormat(false);
              }
              setReformat_recipe("");
            }}
            className="w-2/5 bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            בטל
          </button>
        </div>
      ) : (
        isLoading && reformat_recipe && <Spinner message="טוען..."></Spinner>
      )}
      {showMessage.status && (
        <TypingEffect
          message={showMessage.message}
          onComplete={handleComplete}
        />
      )}
      <EditRecipeModal
        show={editManualModal}
        onClose={() => setEditManualModal(false)}
        recipeData={recipeData}
        setRecipeData={setRecipeData}
        onSave={handleSaveManualEdit}
      />
    </div>
  );
};

export default RecipeDetail;