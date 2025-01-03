"use client";
import { useState } from "react";
import Image from "next/image";
import homeImage from "../../../public/homeImage.png";
import Spinner from "@/components/ui/Spinner";
import Recipes from "@/components/Recipes";
import Search from "@/components/Search";
import { recipe } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import Modal from "@/components/Modal";
import DraggableBubble from "@/components/DraggableButton";
import MealSuggestionForm from "@/components/MealSuggestionForm";
import { RecipeCardSkeleton } from '@/components/ui/Skeleton'
import { Typography } from "@/components/ui/Typography";
import { Container } from "@/components/ui/Container";


export default function Page() {
  const [recipes, setRecipes] = useState<Record<string, recipe>>({});
  const [resultCount, setResultCount] = useState<number | "">();
  const [mealSuggestionForm, setMealSuggestionForm] = useState(false);

  const { isAuthenticated, canEdit, isLoading } = useAuth("/login", false);

  if (isLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <Spinner message="מאמת..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <Spinner message="חוזר לדף הכניסה..." />
      </div>
    );
  }

  const handleSearch = (newRecipes: Record<string, recipe>) => {
    setRecipes(newRecipes);   
    setResultCount(Object.keys(newRecipes).length);
  };

  return (
    <main className="h-[calc(100dvh-52px)] bg-secondary-50 flex flex-col overflow-hidden">
      <Container className="h-full flex flex-col overflow-hidden py-6 px-4 sm:px-6">
        {/* Hero Section - Refined version */}
        <div className="relative rounded-3xl overflow-hidden bg-white shadow-warm border border-primary-100 flex-shrink-0 h-[160px] lg:h-[180px] transition-all duration-300 hover:shadow-lg">
          {/* Background Pattern - More subtle */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50/30 via-transparent to-secondary-50/20">
            <Image
              src="/cooking-pattern.svg"
              alt=""
              fill
              className="opacity-[0.1] object-cover mix-blend-multiply"
            />
          </div>

          <div className="relative z-10 p-5 md:p-6 h-full flex items-center justify-between">
            {/* Text Content - With subtle animation */}
            <div className="max-w-xl">
              <div>
                <Typography 
                  variant="h1" 
                  className="text-3xl md:text-4xl text-primary-800 mb-3 font-handwriting transform hover:-rotate-1 transition-transform duration-300"
                >
                  המתכונים המשפחתיים שלנו
                </Typography>
              </div>
              <div >
                <Typography 
                  variant="body" 
                  className="text-base md:text-lg text-secondary-600 transform transition-all duration-300"
                >
                  מקום בו כל המתכונים המשפחתיים 
                  <span className="text-primary-600 font-medium mx-1 opacity-75">נשמרים</span> 
                  ו<span className="text-primary-600 font-medium opacity-75">משותפים</span>
                </Typography>
              </div>
            </div>

            {/* Illustration Container - With enhanced effects */}
            <div className="relative w-40 h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 flex-shrink-0 transform transition-transform duration-300">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/10 rounded-full" />
              <div className="absolute inset-0 bg-primary-50/10 rounded-full filter blur-xl scale-95" />
              <Image
                src="/home-image.png"
                alt=""
                fill
                priority
                sizes="(max-width: 768px) 160px, (max-width: 1024px) 192px, 224px"
                className="object-contain drop-shadow-xl transform transition-transform duration-300 hover:scale-105"
              />
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-200/20 to-transparent" />
        </div>

        {/* Subtle spacing adjustment */}
        <div className="flex flex-col min-h-0 flex-1 mt-6">


          <div className="overflow-y-auto flex-1 -mx-4 px-4">
            {Object.keys(recipes).length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6 pb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <RecipeCardSkeleton key={n} />
                ))}
              </div>
            ) : (
              <Recipes recipes={Object.values(recipes)} />
            )}
          </div>
        </div>

        {/* Search Component - Updated Styling */}
        <div className="mt-6 flex-shrink-0">
          <Search 
            onSearch={handleSearch}
            resultCount={resultCount}
            className="shadow-warm border-t border-secondary-200/30"
          />
        </div>
      </Container>

      {/* Floating Action Button & Modal */}
      <DraggableBubble onClick={() => setMealSuggestionForm(!mealSuggestionForm)} />
      <Modal
        isOpen={mealSuggestionForm}
        onClose={() => setMealSuggestionForm(false)}
      >
        <MealSuggestionForm />
      </Modal>
    </main>
  );
} 