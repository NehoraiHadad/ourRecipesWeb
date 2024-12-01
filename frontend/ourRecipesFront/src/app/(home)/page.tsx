"use client";
import { useState } from "react";
import Image from "next/image";
import homeImage from "../../../public/homeImage.png";
import Spinner from "../../components/Spinner";
import Recipes from "../../components/Recipes";
import Search from "../../components/Search";
import { recipe } from "../../types";
import { useAuth } from "@/hooks/useAuth";
import Modal from "@/components/Modal";
import DraggableBubble from "@/components/DraggableButton";
import MealSuggestionForm from "@/components/MealSuggestionForm";

export default function Page() {
  const [recipes, setRecipes] = useState<Record<string, recipe>>({});
  const [resultCount, setResultCount] = useState<number | "">();
  const [mealSuggestionForm, setMealSuggestionForm] = useState(false);

  const { isAuthenticated, canEdit, isChecking } = useAuth("/login", false);

  if (isChecking) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner message="מאמת..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner message="חוזר לדף הכניסה..." />
      </div>
    );
  }

  const handleSearch = (newRecipes: Record<string, recipe>) => {
    setRecipes(newRecipes);
    setResultCount(Object.keys(newRecipes).length);
  };

  return (
    <main className="flex flex-col h-[calc(100dvh-52px)] items-center">
      <DraggableBubble onClick={() => setMealSuggestionForm(!mealSuggestionForm)} />
      <Modal
        isOpen={mealSuggestionForm}
        onClose={() => setMealSuggestionForm(false)}
      >
        <MealSuggestionForm />
      </Modal>
      <div className="flex justify-center px-5 w-full lg:px-72">
        <Image
          src={homeImage}
          alt="Just home Image Description"
          priority={true}
        />
      </div>
      <div className="text-center w-full pb-2">
        <h1 className="font-bold text-2xl">המתכונים:</h1>
        <p className="text-xs opacity-40 ">לחץ כדי להרחיב</p>
      </div>
      <Recipes {...Object.values(recipes)} />
      <Search onSearch={handleSearch} resultCount={resultCount} />
    </main>
  );
}
