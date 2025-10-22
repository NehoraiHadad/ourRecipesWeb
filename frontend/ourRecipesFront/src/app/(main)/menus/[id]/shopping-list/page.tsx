'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { menuService } from '@/services/menuService';
import { useNotification } from '@/context/NotificationContext';
import ShoppingListDisplay from '@/components/ShoppingListDisplay';
import Spinner from '@/components/ui/Spinner';
import type { Menu } from '@/types';

export default function ShoppingListPage() {
  const params = useParams();
  const { addNotification } = useNotification();

  const menuId = parseInt(params.id as string);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (menuId) {
      loadMenu();
    }
  }, [menuId]);

  const loadMenu = async () => {
    setLoading(true);

    try {
      const response = await menuService.getMenu(menuId);

      if (response.menu) {
        setMenu(response.menu);
      }
    } catch (error) {
      console.error('Error loading menu:', error);
      addNotification({ message: 'שגיאה בטעינת התפריט', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[calc(100dvh-52px)] flex justify-center items-center">
        <Spinner />
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="h-[calc(100dvh-52px)] flex flex-col justify-center items-center">
        <div className="text-6xl mb-4">😕</div>
        <h2 className="text-2xl font-bold text-secondary-800 dark:text-white">
          תפריט לא נמצא
        </h2>
      </div>
    );
  }

  return <ShoppingListDisplay menuId={menuId} menuName={menu.name} />;
}
