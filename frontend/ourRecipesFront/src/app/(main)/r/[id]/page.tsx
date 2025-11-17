'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Spinner from '@/components/ui/Spinner';

/**
 * עמוד alias קצר למתכונים משותפים
 * מקבל telegram_id ב-URL, טוען את המתכון, ועושה redirect ל-/recipe/{database_id}
 */
export default function RecipeShortLinkPage() {
  const params = useParams();
  const router = useRouter();
  const telegramId = params.id as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndRedirect = async () => {
      try {
        // Fetch recipe by telegram_id from share endpoint
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/recipes/share/${telegramId}`
        );

        if (!response.ok) {
          setError('מתכון לא נמצא');
          return;
        }

        const data = await response.json();

        // Redirect to the full recipe page using database ID
        if (data.data?.id) {
          router.replace(`/recipe/${data.data.id}`);
        } else {
          setError('שגיאה בטעינת המתכון');
        }
      } catch (err) {
        console.error('Error fetching shared recipe:', err);
        setError('שגיאה בטעינת המתכון');
      }
    };

    if (telegramId) {
      fetchAndRedirect();
    }
  }, [telegramId, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-6xl mb-4">😕</div>
        <p className="text-lg text-secondary-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner />
    </div>
  );
}
