"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../hooks/useAuth";
import RecipeManagement from "../../../components/RecipeManagement";
import Spinner from "@/components/ui/Spinner";
import { SyncStatus } from '@/components/SyncStatus';

export default function ManagePage() {
  const router = useRouter();
  const { isAuthenticated, canEdit, isLoading } = useAuth("/", false);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !canEdit)) {
      router.push("/");
    }
  }, [isAuthenticated, canEdit, isLoading, router]);

  if (isLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <Spinner message="מאמת הרשאות..." />
      </div>
    );
  }

  if (!isAuthenticated || !canEdit) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <Spinner message="חוזר לדף הבית..." />
      </div>
    );
  }

  return (
    <main className="flex flex-col h-[calc(100dvh-52px)]">
      <div className="p-4 border-b bg-white">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">ניהול מתכונים</h1>
          <SyncStatus compact />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <RecipeManagement />
      </div>
    </main>
  );
}
