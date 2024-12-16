"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import RecipeManagement from "../../components/RecipeManagement";
import Spinner from "../../components/Spinner";

export default function ManagePage() {
  const router = useRouter();
  const { isAuthenticated, canEdit, isChecking } = useAuth("/", false);

  useEffect(() => {
    if (!isChecking && (!isAuthenticated || !canEdit)) {
      router.push("/");
    }
  }, [isAuthenticated, canEdit, isChecking, router]);

  if (isChecking) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner message="מאמת הרשאות..." />
      </div>
    );
  }

  if (!isAuthenticated || !canEdit) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner message="חוזר לדף הבית..." />
      </div>
    );
  }

  return (
    <main className="flex flex-col h-[calc(100dvh-52px)]">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold">ניהול מתכונים</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <RecipeManagement />
      </div>
    </main>
  );
}
