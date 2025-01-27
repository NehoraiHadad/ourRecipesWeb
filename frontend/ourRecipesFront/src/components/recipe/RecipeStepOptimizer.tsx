import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Typography } from "@/components/ui/Typography";
import Spinner from "@/components/ui/Spinner";
import { FeatureIndicator } from "@/components/ui/FeatureIndicator";

const OptimizeIcon = () => (
  <svg
    className="w-4 h-4 "
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M20 8C18.5 5 15.5 3 12 3C7 3 3 7 3 12C3 17 7 21 12 21C17 21 21 17 21 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />

    <path
      d="M17 8H20V5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface OptimizedStep {
  description: string;
  estimated_time: string;
  dependencies: string[];
}

interface StepGroup {
  step_group: string;
  parallel_steps: OptimizedStep[];
}

interface PrepAheadStep {
  description: string;
  max_prep_time: string;
}

interface OptimizedSteps {
  optimized_steps: StepGroup[];
  prep_ahead_steps: PrepAheadStep[];
  total_optimized_time: string;
  total_sequential_time: string;
  time_saved: string;
}

interface RecipeStepOptimizerProps {
  recipeText: string;
}

const RecipeStepOptimizer: React.FC<RecipeStepOptimizerProps> = ({
  recipeText,
}) => {
  const [loading, setLoading] = useState(false);
  const [optimizedSteps, setOptimizedSteps] = useState<OptimizedSteps | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const optimizeSteps = async () => {
    if (!recipeText) {
      setError("לא נמצא טקסט מתכון לניתוח");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/optimize-steps`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ recipe_text: recipeText }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to optimize recipe steps");
      }

      const data = await response.json();
      console.log("Server response:", data);

      // The data is already parsed, no need for additional parsing
      if (!data.optimized_steps || typeof data.optimized_steps !== "object") {
        throw new Error("Invalid response format from server");
      }

      setOptimizedSteps(data.optimized_steps);
    } catch (err) {
      console.error("Optimization error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-4">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full relative pt-2 pr-2">
      {error && (
        <Typography variant="body" className="text-red-600 mb-4">
          {error}
        </Typography>
      )}

      {!optimizedSteps && (
        <div className="relative inline-block mr-4">
          <FeatureIndicator
            featureId="recipe-optimizer"
          >
            <Button
              variant="ghost"
              onClick={optimizeSteps}
              className="flex items-center gap-2 text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg px-3 py-2 transition-colors"
            >
              <OptimizeIcon />
              <span className="text-sm">ייעול זמני הכנה</span>
            </Button>
          </FeatureIndicator>
        </div>
      )}

      {optimizedSteps &&
        optimizedSteps.prep_ahead_steps &&
        optimizedSteps.optimized_steps && (
          <div className="space-y-4">
            <Typography variant="h3">ייעול זמני הכנה</Typography>
            <div className="flex gap-4 flex-wrap">
              <div className="bg-secondary-50 rounded-lg px-3 py-1.5 text-sm">
                זמן מקורי: {optimizedSteps.total_sequential_time || "0"} דקות
              </div>
              <div className="bg-green-50 text-green-700 rounded-lg px-3 py-1.5 text-sm">
                זמן מיועל: {optimizedSteps.total_optimized_time || "0"} דקות
              </div>
              <div className="bg-primary-50 text-primary-700 rounded-lg px-3 py-1.5 text-sm">
                חסכון: {optimizedSteps.time_saved || "0"} דקות
              </div>
            </div>

            {optimizedSteps.prep_ahead_steps.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-secondary-50 p-4">
                  <Typography variant="h4">הכנות מראש</Typography>
                </div>
                <div className="p-4">
                  <div className="space-y-3">
                    {optimizedSteps.prep_ahead_steps.map((step, index) => (
                      <div
                        key={index}
                        className="border-b pb-3 last:border-b-0 last:pb-0"
                      >
                        <Typography variant="body">
                          {step.description}
                        </Typography>
                        <Typography
                          variant="body"
                          className="text-sm text-secondary-600"
                        >
                          ניתן להכין עד {step.max_prep_time} שעות מראש
                        </Typography>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {optimizedSteps.optimized_steps.map((group, groupIndex) => (
              <div
                key={groupIndex}
                className="border rounded-lg overflow-hidden"
              >
                <div className="bg-secondary-50 p-4">
                  <Typography variant="h4">{group.step_group}</Typography>
                </div>
                <div className="p-4">
                  <div className="space-y-4">
                    {group.parallel_steps.map((step, stepIndex) => (
                      <div
                        key={stepIndex}
                        className="border-b pb-4 last:border-b-0 last:pb-0"
                      >
                        <Typography variant="body">
                          {step.description}
                        </Typography>
                        <Typography
                          variant="body"
                          className="text-sm text-secondary-600 mt-1"
                        >
                          זמן משוער: {step.estimated_time} דקות
                        </Typography>
                        {step.dependencies.length > 0 && (
                          <Typography
                            variant="body"
                            className="text-sm text-secondary-500 mt-1"
                          >
                            תלוי ב: {step.dependencies.join(", ")}
                          </Typography>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

export default RecipeStepOptimizer;
