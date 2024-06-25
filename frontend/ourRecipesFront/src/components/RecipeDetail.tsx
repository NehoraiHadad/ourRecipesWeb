import React, { useEffect, useState } from "react";
import { recipe } from "../types";
import { useAuthContext } from "../context/AuthContext";
import Spinner from "./Spinner";
import { isRecipeUpdated, parseRecipe } from "../utils/formatChecker";
import TypingEffect from "./TypingEffect";
import EditRecipeModal from "./EditRecipeModal";

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
  const [recipeData, setRecipeData] = useState({
    title: "",
    ingredients: [] as string[],
    instructions: "",
  });
  const [selectedIngredients, setSelectedIngredients] = useState<boolean[]>([]);
  const [editManualModal, setEditManualModal] = useState(false);

  useEffect(() => {
    recipeData.title = recipe.title;
    // Check and parse the recipe immediately if it's already in the updated format
    if (isRecipeUpdated(recipe.title + "\n" + recipe.details)) {
      const formattedRecipe = parseRecipe(recipe.title + "\n" + recipe.details);
      setRecipeData(formattedRecipe);
      setSelectedIngredients(
        new Array(formattedRecipe.ingredients.length).fill(false)
      );
      setNewFormat(true);
    }
  }, [recipe]);

  const handleIngredientClick = (index: number) => {
    setSelectedIngredients((prev) => {
      const newSelected = [...prev];
      newSelected[index] = !newSelected[index];
      return newSelected;
    });
  };

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
        setRecipeData(formattedRecipe);
        setSelectedIngredients(
          new Array(formattedRecipe.ingredients.length).fill(false)
        );
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
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/update_recipe`,
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
      if (result.new_message_id) {
        recipe.id = result.new_message_id;
      }
      console.log(recipe.id);
      console.log(recipe);
      setShowMessage({ status: true, message: "המתכון נשמר בהצלחה" });
      return result;
    } catch (error) {
      console.error("Error updating recipe:", error);
      setShowMessage({ status: true, message: "שגיאה בשמירת המתכון" });
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
      `כותרת: ${
        recipeData.title
      }\n\nרשימת מצרכים:\n-${recipeData.ingredients.join(
        "\n-"
      )}\n\nהוראות הכנה:\n${recipeData.instructions}`
    );

    setNewFormat(true);
    setEditManualModal(false);
  };

  return (
    <div>
      {recipe.image && (
        <img src={recipe.image} alt={recipe.title} className="rounded-lg" />
      )}
      {newFormat ? (
        <div className="p-4">
          <h2 className="text-2xl font-bold text-center mb-4">
            {recipeData.title}
          </h2>
          <ul>
            {recipeData.ingredients.map((ingredient, index) => (
              <li
                key={index}
                className="cursor-pointer"
                onClick={() => handleIngredientClick(index)}
              >
                <span>
                  {selectedIngredients[index] ? "✓ " : "• "} {ingredient}
                </span>
              </li>
            ))}
          </ul>
          <div className="whitespace-pre-line my-4">
            {recipeData.instructions.split("\n").map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4">
          <h2>{recipe.title}</h2>
          <p className="whitespace-pre text-balance">
            {recipe.details
              .replace(/(\n)+/g, (match) => {
                let numOfNewLines = match.length;
                return "\n".repeat(
                  numOfNewLines > 1 ? numOfNewLines - 1 : numOfNewLines
                );
              })
              }
          </p>
        </div>
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
                קסם הAI
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
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveManualEdit();
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                כותרת:
              </label>
              <input
                type="text"
                value={recipeData.title ? recipeData.title : recipe.title}
                onChange={(e) =>
                  setRecipeData({ ...recipeData, title: e.target.value })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                רשימת מצרכים:
              </label>
              <textarea
                value={
                  recipeData.ingredients.length > 0
                    ? recipeData.ingredients.join("\n")
                    : ""
                }
                onChange={(e) =>
                  setRecipeData({
                    ...recipeData,
                    ingredients: e.target.value.split("\n"),
                  })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                rows={5}
                placeholder="כל מצרך בשורה חדשה"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                הוראות הכנה:
              </label>
              <textarea
                value={
                  recipeData.instructions
                    ? recipeData.instructions
                    : recipe.details
                }
                onChange={(e) =>
                  setRecipeData({ ...recipeData, instructions: e.target.value })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                rows={5}
                placeholder="למען הסדר הטוב - נחלק את ההכנה לשלבים ובכל שלב נרד שורה.  כדאי גם להוסיף מספור בתחילת השורה."
              />
            </div>
            <button
              type="submit"
              className="py-2 px-4 bg-green-500 text-white rounded hover:bg-green-700"
            >
              הצג
            </button>
          </div>
        </form>
      </EditRecipeModal>
    </div>
  );
};

export default RecipeDetail;
