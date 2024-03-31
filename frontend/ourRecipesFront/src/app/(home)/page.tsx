"use client";
import { useState } from "react";
import Image from "next/image";
import homeImage from "../../../public/homeImage.png";
import Recipes from "@/components/Recipes";
import Search from "@/components/Search";
import { recipe } from "../../../types";

export default function Home() {
  const [recipes, setRecipes] = useState<recipe[]>([]);
  const [resultCount, setResultCount] = useState<number | "">();

  const resetResultCount = () => {
    setResultCount("");
  };

  const fetchRecipes = async (query: string) => {
    try {
      resetResultCount();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/search?query=${encodeURIComponent(
          query
        )}`
      );
      if (!response.ok) throw new Error("Failed to fetch");
      const data: recipe[] = await response.json();
      setRecipes(data);
      setResultCount(Object.keys(data).length);
    } catch (error) {
      console.error("Fetching error:", error);
      setRecipes([]);
    }
  };
  return (
    <main className="flex flex-col h-[calc(100dvh-52px)] items-center">
      <div className="flex justify-center px-5 w-full lg:px-72">
        <Image src={homeImage} alt="Just home Image Description" />
      </div>
      <div className="text-center w-full pb-2">
        <h1 className="font-bold text-2xl">המתכונים:</h1>
        <p className="text-xs opacity-40 ">לחץ כדי להרחיב</p>
      </div>
      <Recipes {...recipes} />
      <Search onSearch={fetchRecipes} resultCount={resultCount} />
    </main>
  );
}
