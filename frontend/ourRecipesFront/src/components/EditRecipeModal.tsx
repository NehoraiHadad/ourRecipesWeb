import React, { useState, useRef } from 'react';
import useOutsideClick from "@/hooks/useOutsideClick";
import Spinner from "./Spinner"; // Make sure you have this component

interface EditRecipeModalProps {
  show: boolean;
  onClose: () => void;
  recipeData: {
    title: string;
    ingredients: string[];
    instructions: string;
    image: string | null;
  } | null;
  setRecipeData: React.Dispatch<React.SetStateAction<{
    title: string;
    ingredients: string[];
    instructions: string;
    image: string | null;
  } | null>>;
  onSave: () => void;
}

const EditRecipeModal: React.FC<EditRecipeModalProps> = ({
  show,
  onClose,
  recipeData,
  setRecipeData,
  onSave,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const modalRef = useRef(null);
  useOutsideClick(modalRef, onClose);

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
            body: JSON.stringify({ recipeContent: `${recipeData.title}\n${recipeData.ingredients.join("\n")}\n${recipeData.instructions}` }),
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 transition-all duration-700 ease-in-out">
      <div ref={modalRef} className="bg-white p-6 rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">עריכת מתכון</h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800 transition-colors duration-300"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
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
          <div>
            <label className="block text-sm font-medium text-gray-700">רשימת מצרכים:</label>
            <textarea
              value={recipeData.ingredients.join("\n")}
              onChange={(e) => setRecipeData(prev => prev ? { ...prev, ingredients: e.target.value.split("\n") } : null)}
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
      </div>
    </div>
  );
};

export default EditRecipeModal;