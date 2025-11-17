'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * עמוד alias קצר למתכונים
 * מנתב מ-/r/{telegram_id} ל-/recipe/{telegram_id}
 */
export default function RecipeShortLinkPage() {
  const params = useParams();
  const router = useRouter();
  const telegramId = params.id as string;

  useEffect(() => {
    // Simple redirect - telegram_id is used everywhere now
    router.replace(`/recipe/${telegramId}`);
  }, [telegramId, router]);

  return null;
}
