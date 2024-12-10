import React, { useState, useRef, useEffect } from 'react';
import useOutsideClick from "../hooks/useOutsideClick";
import Spinner from "./Spinner"; // Make sure you have this component
import CategoryTags from './CategoryTags';
import VersionHistory from './VersionHistory';

interface EditRecipeModalProps {
  show: boolean;
  onClose: () => void;
  recipeData: {
    id: number;
    title: string;
    ingredients: string[] | string;
    instructions?: string;
    raw_content?: string;
    image: string | null;
    categories?: string[];
    preparation_time?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
  } | null;
  setRecipeData: React.Dispatch<React.SetStateAction<{
    id: number;
    title: string;
    ingredients: string[] | string;
    instructions?: string;
    raw_content?: string;
    image: string | null;
    categories?: string[];
    preparation_time?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
  } | null>>;
  onSave: () => void;
}

const difficultyOptions = [
  { value: 'easy', label: 'קל' },
  { value: 'medium', label: 'בינוני' },
  { value: 'hard', label: 'מורכב' }
];

const EditRecipeModal: React.FC<EditRecipeModalProps> = ({
  show,
  onClose,
  recipeData,
  setRecipeData,
  onSave,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  useOutsideClick(modalRef, onClose);

  useEffect(() => {
    if (show) {
      const initCategories = async () => {
        try {
          
          
          // Fetch categories after potential initialization
          fetchExistingCategories();
        } catch (error) {
          console.error("Error initializing categories:", error);
        }
      };
      
      initCategories();
    }
  }, [show]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchExistingCategories = async () => {
    try {
      console.log("Fetching categories...");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/categories`,
        {
          credentials: "include",
        }
      );
      console.log("Response status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("Raw response data:", data);
        if (Array.isArray(data)) {
          setExistingCategories(data);
          console.log("Set categories:", data);
        } else {
          console.error("Unexpected data format:", data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  if (!show || !recipeData) return null;

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setRecipeData(prev => prev ? { ...prev, image: reader.result as string } : null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAIGenerate = async () => {
    if (recipeData) {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/generate-image`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ 
              recipeContent: `${recipeData.title}\n${
                Array.isArray(recipeData.ingredients) ? recipeData.ingredients.join("\n") : recipeData.ingredients
              }\n${recipeData.instructions}` 
            }),
          }
        );

        if (!response.ok) throw new Error("Failed to generate image");

        const result = await response.json();
        setRecipeData(prev => prev ? { ...prev, image: `data:image/jpeg;base64,${result.image}` } : null);
      } catch (error) {
        console.error("Error generating image:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleRestoreVersion = async (versionId: number) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/${recipeData.id}/versions/${versionId}/restore`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to restore version');
      }

      const data = await response.json();
      
      // עדכון הנתונים בטופס העריכה
      if (data.recipe) {
        setRecipeData({
          ...recipeData,
          title: data.recipe.title || '',
          raw_content: data.recipe.raw_content || '',
          ingredients: data.recipe.ingredients || [],
          instructions: data.recipe.instructions || '',
          categories: data.recipe.categories || [],
          image: data.recipe.image || null
        });
      }
      
      setShowVersionHistory(false);  // חזרה לטופס העריכה
    } catch (error) {
      console.error('Error restoring version:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div ref={modalRef} className="bg-white p-6 rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">עריכת מתכון</h2>
          <div className="flex gap-2">
            {showVersionHistory ? (
              null  // לא מציגים את הכפתור כשמציגים היסטוריה
            ) : (
              <button
                onClick={() => setShowVersionHistory(true)}
                className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
              >
                היסטוריית גרסאות
              </button>
            )}
            <button onClick={onClose}>✕</button>
          </div>
        </div>

        {showVersionHistory ? (
          <VersionHistory
            recipeId={recipeData.id}
            onRestore={handleRestoreVersion}
            onClose={() => setShowVersionHistory(false)}
          />
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-6">
            <div>
              {isLoading ? (
                <div className="mt-2">
                  <Spinner message="מייצר תמונה..." />
                </div>
              ) : recipeData.image ? (
                <div className="mt-2 space-y-2">
                  <img
                    src={recipeData.image.startsWith('data:') ? recipeData.image : `data:image/jpeg;base64,${recipeData.image}`}
                    alt="Recipe"
                    className="max-w-full h-auto rounded-lg shadow-md"
                  />
                  <div className="flex space-x-2">
                    <input
                      type="file"
                      onChange={handlePhotoUpload}
                      accept="image/*"
                      className="hidden"
                      id="photo-upload"
                    />
                    <label
                      htmlFor="photo-upload"
                      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-300 cursor-pointer flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      החלף תמונה
                    </label>
                    <button
                      type="button"
                      onClick={handleAIGenerate}
                      className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-300 flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      יצירת תמונה באמצעות AI
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex space-x-2">
                  <input
                    type="file"
                    onChange={handlePhotoUpload}
                    accept="image/*"
                    className="hidden"
                    id="photo-upload"
                  />
                  <label
                    htmlFor="photo-upload"
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-300 cursor-pointer flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    הוסף תמונה
                  </label>
                  <button
                    type="button"
                    onClick={handleAIGenerate}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-300 flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    יצירת תמונה באמצעות AI
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">כותרת:</label>
              <input
                type="text"
                value={recipeData.title}
                onChange={(e) => setRecipeData(prev => prev ? { ...prev, title: e.target.value } : null)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">זמן הכנה (בדקות):</label>
                <input
                  type="number"
                  min="0"
                  value={recipeData.preparation_time || ''}
                  onChange={(e) => setRecipeData(prev => prev ? {
                    ...prev,
                    preparation_time: e.target.value ? Number(e.target.value) : undefined
                  } : null)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="למשל: 30"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">רמת קושי:</label>
                <select
                  value={recipeData.difficulty || ''}
                  onChange={(e) => setRecipeData(prev => prev ? {
                    ...prev,
                    difficulty: e.target.value as 'easy' | 'medium' | 'hard' | undefined
                  } : null)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">בחר רמת קושי</option>
                  {difficultyOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700">קטגוריות:</label>
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
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const newCategory = categoryInput.trim();
                        if (newCategory && !recipeData.categories?.includes(newCategory)) {
                          setRecipeData(prev => prev ? {
                            ...prev,
                            categories: [...(prev.categories || []), newCategory]
                          } : null);
                          setCategoryInput('');
                          setShowCategoryDropdown(false);
                        }
                      }
                    }}
                    onFocus={() => setShowCategoryDropdown(true)}
                  />
                  
                  {/* Dropdown for existing categories */}
                  {showCategoryDropdown && (
                    <div ref={dropdownRef} className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                      {existingCategories.length > 0 ? (
                        <>
                          <div className="sticky top-0 bg-gray-50 px-4 py-2 text-sm text-gray-500">
                            {existingCategories.length} קטגוריות קיימות
                          </div>
                          {existingCategories
                            .filter(cat => 
                              !recipeData.categories?.includes(cat) && 
                              cat.toLowerCase().includes(categoryInput.toLowerCase())
                            )
                            .map((category, index) => (
                              <div
                                key={index}
                                className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-right"
                                onClick={() => {
                                  setRecipeData(prev => prev ? {
                                    ...prev,
                                    categories: [...(prev.categories || []), category]
                                  } : null);
                                  setCategoryInput('');
                                  setShowCategoryDropdown(false);
                                }}
                              >
                                {category}
                              </div>
                            ))}
                        </>
                      ) : (
                        <div className="px-4 py-2 text-gray-500 text-sm">
                          אין עדיין קטגוריות. הקלד קטגוריה חדשה והקש Enter
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected categories */}
              {recipeData.categories && recipeData.categories.length > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">קטגוריות נבחרות:</label>
                  <CategoryTags
                    categories={recipeData.categories}
                    onClick={(category) => {
                      setRecipeData(prev => prev ? {
                        ...prev,
                        categories: prev.categories?.filter(c => c !== category)
                      } : null);
                    }}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">רשימת מצרכים:</label>
              <textarea
                value={Array.isArray(recipeData.ingredients) 
                  ? recipeData.ingredients.join("\n") 
                  : recipeData.ingredients || ''}
                onChange={(e) => setRecipeData(prev => prev ? { 
                  ...prev, 
                  ingredients: e.target.value.split("\n") 
                } : null)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                rows={5}
                placeholder="כל מצרך בשורה חדשה"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">הוראות הכנה:</label>
              <textarea
                value={recipeData.instructions}
                onChange={(e) => setRecipeData(prev => prev ? { ...prev, instructions: e.target.value } : null)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                rows={5}
                placeholder="למען הסדר הטוב - נחלק את ההכנה לשלבים ובכל שלב נרד שורה. כדאי גם להוסיף מספור בתחילת השורה."
              />
            </div>
            <div className="flex justify-between space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors duration-300"
              >
                ביטול
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-300"
              >
                שמור שינויים
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EditRecipeModal;