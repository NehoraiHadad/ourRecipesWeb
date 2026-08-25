/**
 * The recipe modal: renders the recipe the API serialized
 * (STRUCTURE_REFACTOR_TASKS.md §D1) and hosts the edit / AI / version actions.
 *
 * Nothing here parses recipe text. A parsed recipe goes to `RecipeDisplay`
 * (structured fields), anything else to `RawRecipeView`, and every write goes
 * through `useRecipeActions`, which adopts the recipe the server re-parsed.
 */
import React, { useEffect, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import TypingEffect from "@/components/TypingEffect";
import RecipeDisplay from "@/components/RecipeDisplay";
import RawRecipeView from "./RawRecipeView";
import { RecipeEditForm } from "./RecipeEditForm";
import RecipeInfographic from "./RecipeInfographic";
import { useRecipeActions } from "./useRecipeActions";
import { Typography } from "@/components/ui/Typography";
import VersionHistory from "@/components/VersionHistory";
import { useRecipeHistory } from "@/contexts/RecipeHistoryContext";
import { ActiveTimers } from "./ActiveTimers";
import RecipeStepOptimizer from "./RecipeStepOptimizer";
import { hasStructuredContent } from "@/lib/recipes/recipeView";
import type { SerializedRecipe } from "@/lib/serializers/recipeTypes";

interface RecipeDetailProps {
  recipe: SerializedRecipe;
  isEditing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
}

/** Don't re-record a view of the same recipe within a minute. */
const VIEW_THROTTLE_MS = 60000;

const RecipeDetails: React.FC<RecipeDetailProps> = ({
  recipe: initialRecipe,
  isEditing,
  onEditStart,
  onEditEnd
}) => {
  const { addToRecentlyViewed } = useRecipeHistory();
  const { authState } = useAuthContext();
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showTimer, setShowTimer] = useState(false);

  const {
    recipe,
    isLoading,
    message,
    aiPreview,
    clearMessage,
    discardAiPreview,
    save,
    saveAiPreview,
    requestReformat,
    restoreVersion
  } = useRecipeActions(initialRecipe);

  const title = recipe.title ?? '';

  useEffect(() => {
    if (!recipe.telegram_id || !title) return;

    const storageKey = `last_view_${recipe.telegram_id}`;
    const lastView = Number(localStorage.getItem(storageKey));
    const now = Date.now();
    if (lastView && now - lastView <= VIEW_THROTTLE_MS) return;

    localStorage.setItem(storageKey, String(now));
    addToRecentlyViewed({ id: recipe.telegram_id, title });
  }, [recipe.telegram_id, title, addToRecentlyViewed]);

  const handleRestore = async (versionId: number) => {
    if (await restoreVersion(versionId)) setShowVersionHistory(false);
  };

  const handleSaveEdit = async (payload: Parameters<typeof save>[0]) => {
    if (await save(payload)) onEditEnd();
  };

  const renderRecipe = () => {
    if (aiPreview) {
      return (
        <RawRecipeView
          text={aiPreview}
          image={recipe.image_url}
          notice="תצוגה מקדימה של הצעת ה-AI — עדיין לא נשמרה. אחרי השמירה המתכון יוצג מסודר."
        />
      );
    }

    if (hasStructuredContent(recipe)) {
      return (
        <RecipeDisplay
          recipe={recipe}
          onPrepTimeClick={() => setShowTimer((prev) => !prev)}
          showTimer={showTimer}
        />
      );
    }

    return <RawRecipeView title={recipe.title} text={recipe.raw_content} image={recipe.image_url} />;
  };

  return (
    <>
      <div className="max-w-4xl mx-auto bg-white rounded-2xl overflow-hidden">
        <div className="relative">
          {isEditing ? (
            <RecipeEditForm recipe={recipe} onSave={handleSaveEdit} onCancel={onEditEnd} />
          ) : (
            renderRecipe()
          )}
        </div>

        {!isEditing && !aiPreview && (
          <div className="mt-4">
            <RecipeStepOptimizer recipeText={recipe.raw_content} />
          </div>
        )}

        {!isEditing && (
          <div className="p-6">
            {authState.canEdit && !aiPreview && (
              <div className="flex flex-col gap-4">
                <div className="flex justify-center gap-4">
                  <Button
                    variant="primary"
                    onClick={requestReformat}
                    isLoading={isLoading}
                    className="flex items-center gap-2 shadow-warm hover:shadow-lg transition-all"
                  >
                    <Typography variant="body" className="font-handwriting-amit">AI</Typography>
                    <Typography variant="h3" className="text-lg">✨</Typography>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={onEditStart}
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

                <RecipeInfographic recipeContent={recipe.raw_content} title={title} />
              </div>
            )}

            {showVersionHistory && (
              <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                  <VersionHistory
                    recipeId={recipe.telegram_id}
                    onRestore={handleRestore}
                    onClose={() => setShowVersionHistory(false)}
                  />
                </div>
              </div>
            )}

            {authState.canEdit && aiPreview && !isLoading && (
              <div className="flex justify-center gap-4">
                <Button
                  variant="primary"
                  onClick={saveAiPreview}
                  className="shadow-warm hover:shadow-lg transition-all"
                >
                  <Typography variant="body" className="font-handwriting-amit">שמור</Typography>
                </Button>
                <Button
                  variant="secondary"
                  onClick={discardAiPreview}
                  className="shadow-warm hover:shadow-lg transition-all"
                >
                  <Typography variant="body" className="font-handwriting-amit">בטל</Typography>
                </Button>
              </div>
            )}

            {isLoading && aiPreview && (
              <div className="flex justify-center">
                <Spinner message="מעבד את המתכון..." />
              </div>
            )}

            {message && (
              <div className="mt-4 text-center">
                <Typography variant="body">
                  <TypingEffect message={message} onComplete={clearMessage} />
                </Typography>
              </div>
            )}
          </div>
        )}
      </div>

      <ActiveTimers />
    </>
  );
};

export default RecipeDetails;
