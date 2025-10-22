'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { menuService } from '@/services/menuService';
import { useNotification } from '@/context/NotificationContext';
import MenuDisplay from '@/components/MenuDisplay';
import Spinner from '@/components/ui/Spinner';
import type { Menu } from '@/types';

export default function MenuDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addNotification } = useNotification();

  const menuId = parseInt(params.id as string);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (menuId) {
      loadMenu();
    }
  }, [menuId]);

  const loadMenu = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await menuService.getMenu(menuId);

      if (response.menu) {
        setMenu(response.menu);
      } else {
        setError('תפריט לא נמצא');
      }
    } catch (err: any) {
      console.error('Error loading menu:', err);
      setError(err.message || 'שגיאה בטעינת התפריט');
      addNotification({ message: 'שגיאה בטעינת התפריט', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleMenuUpdated = (updatedMenu: Menu) => {
    setMenu(updatedMenu);
  };

  const handleMenuDeleted = () => {
    router.push('/menus');
  };

  if (loading) {
    return (
      <div className="h-[calc(100dvh-52px)] flex justify-center items-center">
        <Spinner />
      </div>
    );
  }

  if (error || !menu) {
    return (
      <div className="h-[calc(100dvh-52px)] flex flex-col justify-center items-center">
        <div className="text-6xl mb-4">😕</div>
        <h2 className="text-2xl font-bold text-secondary-800 mb-2">
          {error || 'תפריט לא נמצא'}
        </h2>
        <button
          onClick={() => router.push('/menus')}
          className="text-primary-500 hover:text-primary-700 mt-4"
        >
          חזרה לתפריטים
        </button>
      </div>
    );
  }

  return (
    <MenuDisplay
      menu={menu}
      onMenuUpdated={handleMenuUpdated}
      onMenuDeleted={handleMenuDeleted}
    />
  );
}
