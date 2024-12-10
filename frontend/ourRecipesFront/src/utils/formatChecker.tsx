export const isRecipeUpdated = (text: string): boolean => {
  const hasTitle = text.includes("כותרת:");
  const hasIngredients = text.includes("מצרכים:");
  const hasInstructions = text.includes("הוראות הכנה:");

  return hasTitle && hasIngredients && hasInstructions;
};

export const parseRecipe = (text: string) => {
  const parts = text.split("\n");
  const title = parts[0].replace("כותרת:", "").trim();

  const categoriesIndex = parts.findIndex((part) => part.trim().startsWith("קטגוריות:"));
  const categories = categoriesIndex !== -1 
    ? parts[categoriesIndex].replace("קטגוריות:", "").split(",").map(cat => cat.trim())
    : [];

  const prepTimeIndex = parts.findIndex((part) => part.trim().startsWith("זמן הכנה:"));
  const preparationTime = prepTimeIndex !== -1
    ? Number(parts[prepTimeIndex].replace("זמן הכנה:", "").replace(/[^\d]/g, ""))
    : undefined;

  const difficultyIndex = parts.findIndex((part) => part.trim().startsWith("רמת קושי:"));
  const difficultyMap: { [key: string]: 'easy' | 'medium' | 'hard' } = {
    'קל': 'easy',
    'בינוני': 'medium',
    'מורכב': 'hard'
  };
  const difficultyText = difficultyIndex !== -1
    ? parts[difficultyIndex].replace("רמת קושי:", "").trim()
    : '';
  const difficulty = difficultyMap[difficultyText];

  const ingredientsIndex = parts.findIndex((part) => part.trim() === "רשימת מצרכים:");
  const instructionsIndex = parts.findIndex(
    (part) => part.trim() === "הוראות הכנה:"
  );

  const ingredients = parts
    .slice(ingredientsIndex + 1, instructionsIndex)
    .filter(
      (line) =>
        line.trim() !== "" &&
        !line.trim().startsWith("כותרת:") &&
        !line.trim().startsWith("רשימת מצרכים:")
    )
    .map((ingredient) => ingredient.replace("-", "").trim());

  const instructions = parts
    .slice(instructionsIndex + 1)
    .filter((line) => line.trim() !== "")
    .map((instruction) => instruction.trim())
    .join("\n");

  return {
    title,
    categories,
    preparation_time: preparationTime || undefined,
    difficulty: difficulty || undefined,
    ingredients,
    instructions,
  };
};
