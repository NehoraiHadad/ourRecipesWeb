'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * עמוד alias קצר למתכונים
 * מנתב מ-/r/123 ל-/recipe/123
 */
export default function RecipeShortLinkPage() {
  const params = useParams();
  const router = useRouter();
  const recipeId = params.id as string;

  useEffect(() => {
    // Redirect to the full recipe page
    router.replace(`/recipe/${recipeId}`);
  }, [recipeId, router]);

  return null;
}
