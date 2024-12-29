import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import CategoryTags from "../CategoryTags";
import { recipe } from "@/types";
import { difficultyOptions } from "@/utils/difficulty";
import type { Difficulty } from "@/types";

interface RecipeEditFormProps {
  recipeData: recipe | null;
  onSave: (updatedData: recipe) => void;
  onCancel: () => void;
}

export function RecipeEditForm({
  recipeData,
  onSave,
  onCancel,
}: RecipeEditFormProps) {

  const [formData, setFormData] = useState<recipe | null>(recipeData);
  const [isLoading, setIsLoading] = useState(false);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categoryInput, setCategoryInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchExistingCategories();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowCategoryDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePhotoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!event.target.files?.length) return;

    const file = event.target.files[0];

    // בדיקת סוג הקובץ
    if (!file.type.startsWith("image/")) {
      alert("נא להעלות קובץ תמונה בלבד");
      return;
    }

    // בדיקת גודל הקובץ (מקסימום 5MB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      alert("גודל התמונה חורג מהמותר (מקסימום 5MB)");
      return;
    }

    try {
      setIsLoading(true);
      const reader = new FileReader();

      reader.onloadend = () => {
        setFormData((prev) =>
          prev
            ? {
                ...prev,
                image: reader.result as string,
              }
            : null
        );
        setIsLoading(false);
      };

      reader.onerror = () => {
        alert("שגיאה בקריאת הקובץ");
        setIsLoading(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("שגיאה בהעלאת התמונה");
      setIsLoading(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!formData) return;

    try {
      setIsLoading(true);

      // וידוא שיש מספיק מידע ליצירת תמונה
      if (!formData.title || !formData.ingredients?.length) {
        throw new Error("נדרש למלא כותרת ומצרכים לפני יצירת תמונה");
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/generate-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            recipeContent: `${formData.title}\n${
              Array.isArray(formData.ingredients)
                ? formData.ingredients.join("\n")
                : formData.ingredients
            }\n${
              Array.isArray(formData.instructions)
                ? formData.instructions.join("\n")
                : formData.instructions || ""
            }`,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "שגיאה ביצרת התמונה");
      }

      const result = await response.json();
      setFormData((prev) => (prev ? { ...prev, image: result.image } : null));
    } catch (error) {
      console.error("Error generating image:", error);
      alert(error instanceof Error ? error.message : "שגיאה ביצירת התמונה");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExistingCategories = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/categories`,
        { credentials: "include" }
      );
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setExistingCategories(data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData) {
      // Add missing required fields from recipeData
      const updatedRecipe: recipe = {
        ...formData,
        telegram_id: recipeData?.telegram_id ?? 0,
        details: recipeData?.details ?? "",
        is_parsed: recipeData?.is_parsed ?? false,
        parse_errors: recipeData?.parse_errors ?? null,
        created_at: recipeData?.created_at ?? new Date().toISOString(),
      };
      onSave(updatedRecipe);
    }
  };

  if (!formData) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Image Section */}
      <div className="space-y-4">
        {isLoading ? (
          <Spinner message="מעבד תמונה..." />
        ) : (
          formData?.image && (
            <img
              src={
                formData.image.startsWith("data:")
                  ? formData.image
                  : `data:image/jpeg;base64,${formData.image}`
              }
              alt="Recipe"
              className="max-w-full h-auto rounded-lg shadow-md"
            />
          )
        )}
        <div className="flex gap-2">
          <input
            type="file"
            onChange={handlePhotoUpload}
            accept="image/*"
            className="hidden"
            id="photo-upload"
          />
          <label htmlFor="photo-upload" className="flex-1">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => document.getElementById("photo-upload")?.click()}
            >
              {formData?.image ? "החלף תמונה" : "העלה תמונה"}
            </Button>
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={handleAIGenerate}
            className="flex-1"
          >
            צור תמונה עם AI
          </Button>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          כותרת
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) =>
            setFormData((prev) =>
              prev ? { ...prev, title: e.target.value } : null
            )
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>

      {/* Categories Section */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          קטגוריות
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          <div className="relative w-full">
            <input
              type="text"
              value={categoryInput}
              onChange={(e) => {
                setCategoryInput(e.target.value);
                setShowCategoryDropdown(true);
              }}
              placeholder="הוסף או בחר קטגוריה"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const newCategory = categoryInput.trim();
                  if (
                    newCategory &&
                    !formData?.categories?.includes(newCategory)
                  ) {
                    setFormData((prev) =>
                      prev
                        ? {
                            ...prev,
                            categories: [
                              ...(prev.categories || []),
                              newCategory,
                            ],
                          }
                        : null
                    );
                    setCategoryInput("");
                    setShowCategoryDropdown(false);
                  }
                }
              }}
              onFocus={() => setShowCategoryDropdown(true)}
            />

            {showCategoryDropdown && (
              <div
                ref={dropdownRef}
                className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
              >
                {existingCategories
                  .filter((category) =>
                    category.toLowerCase().includes(categoryInput.toLowerCase())
                  )
                  .map((category) => (
                    <div
                      key={category}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => {
                        if (!formData?.categories?.includes(category)) {
                          setFormData((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  categories: [...(prev.categories || []), category],
                                }
                              : null
                          );
                        }
                        setCategoryInput("");
                        setShowCategoryDropdown(false);
                      }}
                    >
                      {category}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {formData?.categories && formData.categories.length > 0 && (
          <CategoryTags
            categories={formData.categories}
            onClick={(category) => {
              setFormData((prev) =>
                prev
                  ? {
                      ...prev,
                      categories: prev.categories?.filter(
                        (c) => c !== category
                      ),
                    }
                  : null
              );
            }}
          />
        )}
      </div>

      {/* Preparation Time & Difficulty */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            זמן הכנה (בדקות)
          </label>
          <input
            type="number"
            min="0"
            value={formData.preparation_time || ""}
            onChange={(e) =>
              setFormData((prev) =>
                prev
                  ? {
                      ...prev,
                      preparation_time: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    }
                  : null
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="למשל: 30"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            רמת קושי
          </label>
          <select
            value={formData?.difficulty?.toUpperCase() || ""}
            onChange={(e) =>
              setFormData((prev) =>
                prev
                  ? {
                      ...prev,
                      difficulty: e.target.value
                        ? (e.target.value as Difficulty)
                        : undefined,
                    }
                  : null
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">בחר רמת קושי</option>
            {difficultyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ingredients */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          מצרכים
        </label>
        <textarea
          value={
            Array.isArray(formData.ingredients)
              ? formData.ingredients.join("\n")
              : formData.ingredients
          }
          onChange={(e) =>
            setFormData((prev) =>
              prev ? { ...prev, ingredients: e.target.value.split("\n") } : null
            )
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={5}
          placeholder="כל מצרך בשורה חדשה"
        />
      </div>

      {/* Instructions */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          הוראות הכנה
        </label>
        <textarea
          value={
            Array.isArray(formData.instructions)
              ? formData.instructions.join("\n")
              : formData.instructions || ""
          }
          onChange={(e) =>
            setFormData((prev) =>
              prev
                ? {
                    ...prev,
                    instructions: e.target.value.split("\n"),
                  }
                : null
            )
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={8}
          placeholder="פרט את שלבי ההכנה"
        />
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
        <Button variant="primary" type="submit">
          שמור שינויים
        </Button>
      </div>
    </form>
  );
}
