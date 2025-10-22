'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { menuService } from '@/services/menuService';
import { useNotification } from '@/context/NotificationContext';
import { Button } from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import type { Menu } from '@/types';

export default function MenusPage() {
  const router = useRouter();
  const { addNotification } = useNotification();

  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadMenus();
  }, []);

  const loadMenus = async () => {
    setLoading(true);

    try {
      const response = await menuService.getUserMenus();

      if (response.menus) {
        setMenus(response.menus);
      }
    } catch (error) {
      console.error('Error loading menus:', error);
      addNotification({ message: 'שגיאה בטעינת התפריטים', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getDietaryLabel = (type?: string) => {
    const labels = {
      meat: 'בשרי',
      dairy: 'חלבי',
      pareve: 'פרווה',
    };
    return type ? labels[type as keyof typeof labels] || type : '';
  };

  if (loading) {
    return (
      <div className="h-[calc(100dvh-52px)] flex justify-center items-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-52px)] overflow-y-auto bg-secondary-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-secondary-800">
            התפריטים שלי
          </h1>
          <Button variant="primary" onClick={() => router.push('/menus/new')}>
            + צור תפריט חדש
          </Button>
        </div>

        {menus.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menus.map((menu) => (
              <div
                key={menu.id}
                className="bg-white rounded-lg shadow-warm p-6
                         hover:shadow-warm-lg transition-all cursor-pointer"
                onClick={() => router.push(`/menus/${menu.id}`)}
              >
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-secondary-800">
                    {menu.name}
                  </h2>
                  {menu.is_public && (
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded">
                      שותף
                    </span>
                  )}
                </div>

                {menu.description && (
                  <p className="text-secondary-600 text-sm mb-4 line-clamp-2">
                    {menu.description}
                  </p>
                )}

                <div className="space-y-2 text-sm text-secondary-600">
                  {menu.event_type && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">סוג:</span>
                      <span>{menu.event_type}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">סועדים:</span>
                    <span>{menu.total_servings}</span>
                  </div>
                  {menu.dietary_type && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">כשרות:</span>
                      <span>{getDietaryLabel(menu.dietary_type)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">נוצר:</span>
                    <span>{formatDate(menu.created_at)}</span>
                  </div>
                </div>

                {menu.meals && menu.meals.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-secondary-200">
                    <div className="text-sm text-secondary-600">
                      📋 {menu.meals.length} ארוחות
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-warm p-12 text-center">
            <div className="text-6xl mb-4">🍽️</div>
            <h3 className="text-xl font-semibold text-secondary-800 mb-2">
              אין תפריטים עדיין
            </h3>
            <p className="text-secondary-600 mb-6">
              צור תפריט ראשון והתחל לתכנן ארוחות מדהימות!
            </p>
            <Button variant="primary" onClick={() => router.push('/menus/new')}>
              צור תפריט ראשון
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
