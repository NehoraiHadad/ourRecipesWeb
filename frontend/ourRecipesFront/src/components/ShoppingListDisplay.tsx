import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { menuService } from '@/services/menuService';
import { useNotification } from '@/context/NotificationContext';
import { Button } from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import type { ShoppingList, ShoppingListItem } from '@/types';

interface ShoppingListDisplayProps {
  menuId: number;
  menuName?: string;
}

const ShoppingListDisplay: React.FC<ShoppingListDisplayProps> = ({
  menuId,
  menuName,
}) => {
  const router = useRouter();
  const { addNotification } = useNotification();

  const [shoppingList, setShoppingList] = useState<ShoppingList>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [regenerating, setRegenerating] = useState<boolean>(false);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  // Load shopping list
  useEffect(() => {
    loadShoppingList();
  }, [menuId]);

  const loadShoppingList = async () => {
    setLoading(true);

    try {
      const response = await menuService.getShoppingList(menuId);

      if (response.shopping_list) {
        setShoppingList(response.shopping_list);

        // Initialize checked items
        const checked = new Set<number>();
        Object.values(response.shopping_list).forEach((items) => {
          items.forEach((item) => {
            if (item.is_checked) {
              checked.add(item.id);
            }
          });
        });
        setCheckedItems(checked);
      }
    } catch (error) {
      console.error('Error loading shopping list:', error);
      addNotification('שגיאה בטעינת רשימת הקניות', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Toggle item checked status
  const handleToggleItem = async (itemId: number) => {
    const isChecked = checkedItems.has(itemId);
    const newChecked = new Set(checkedItems);

    if (isChecked) {
      newChecked.delete(itemId);
    } else {
      newChecked.add(itemId);
    }

    setCheckedItems(newChecked);

    try {
      await menuService.updateShoppingItemStatus(itemId, !isChecked);
    } catch (error) {
      console.error('Error updating item status:', error);
      // Revert on error
      setCheckedItems(checkedItems);
      addNotification('שגיאה בעדכון הפריט', 'error');
    }
  };

  // Regenerate shopping list
  const handleRegenerate = async () => {
    if (!confirm('האם לייצר מחדש את רשימת הקניות? הסימונים הקיימים יאבדו.')) {
      return;
    }

    setRegenerating(true);

    try {
      const response = await menuService.regenerateShoppingList(menuId);

      if (response.shopping_list) {
        setShoppingList(response.shopping_list);
        setCheckedItems(new Set());
        addNotification('רשימת הקניות עודכנה בהצלחה', 'success');
      }
    } catch (error) {
      console.error('Error regenerating shopping list:', error);
      addNotification('שגיאה ביצירת רשימת הקניות', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  // Export list as text
  const handleExportText = () => {
    let text = `רשימת קניות - ${menuName || 'תפריט'}\n`;
    text += '='.repeat(40) + '\n\n';

    Object.entries(shoppingList).forEach(([category, items]) => {
      text += `${category}:\n`;
      items.forEach((item) => {
        const checked = checkedItems.has(item.id) ? '☑' : '☐';
        text += `  ${checked} ${item.ingredient_name} - ${item.quantity}\n`;
      });
      text += '\n';
    });

    // Copy to clipboard
    navigator.clipboard
      .writeText(text)
      .then(() => {
        addNotification('הרשימה הועתקה ללוח!', 'success');
      })
      .catch(() => {
        addNotification('שגיאה בהעתקת הרשימה', 'error');
      });
  };

  // Print list
  const handlePrint = () => {
    window.print();
  };

  // Calculate progress
  const calculateProgress = () => {
    const allItems = Object.values(shoppingList).flat();
    const totalItems = allItems.length;
    const checkedCount = checkedItems.size;

    return totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;
  };

  const progress = calculateProgress();
  const categoriesCount = Object.keys(shoppingList).length;
  const totalItems = Object.values(shoppingList).flat().length;

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
              📝 רשימת קניות
            </h1>
            {menuName && (
              <p className="text-gray-600 dark:text-gray-400">{menuName}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/menus/${menuId}`)}
          >
            חזרה לתפריט
          </Button>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>התקדמות</span>
            <span>
              {checkedItems.size} מתוך {totalItems} ({progress}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className="bg-blue-500 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
          <div>📦 {categoriesCount} קטגוריות</div>
          <div>🛒 {totalItems} פריטים</div>
          <div>✅ {checkedItems.size} בוצעו</div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? (
              <>
                <Spinner size="sm" />
                <span className="mr-2">מייצר...</span>
              </>
            ) : (
              '🔄 ייצר מחדש'
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportText}>
            📋 העתק כטקסט
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            🖨️ הדפס
          </Button>
        </div>
      </div>

      {/* Shopping list by category */}
      {totalItems > 0 ? (
        <div className="space-y-6">
          {Object.entries(shoppingList)
            .sort(([a], [b]) => a.localeCompare(b, 'he'))
            .map(([category, items]) => (
              <div
                key={category}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6"
              >
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">{getCategoryIcon(category)}</span>
                  {category}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({items.length})
                  </span>
                </h2>

                <div className="space-y-2">
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors
                        ${
                          checkedItems.has(item.id)
                            ? 'bg-green-50 dark:bg-green-900/20'
                            : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedItems.has(item.id)}
                        onChange={() => handleToggleItem(item.id)}
                        className="mt-1 w-5 h-5 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div
                          className={`font-medium ${
                            checkedItems.has(item.id)
                              ? 'line-through text-gray-500 dark:text-gray-400'
                              : 'text-gray-800 dark:text-white'
                          }`}
                        >
                          {item.ingredient_name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {item.quantity}
                        </div>
                        {item.notes && (
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            💡 {item.notes}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
            רשימת הקניות ריקה
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            לא נמצאו פריטים לקנייה
          </p>
          <Button onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? 'מייצר...' : 'ייצר רשימה'}
          </Button>
        </div>
      )}

      {/* Footer note for future Google Keep integration */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          💡 <strong>בקרוב:</strong> סנכרון אוטומטי עם Google Keep!
        </p>
      </div>
    </div>
  );
};

// Helper function to get category icon
function getCategoryIcon(category: string): string {
  const icons: { [key: string]: string } = {
    ירקות: '🥬',
    'בשר ודגים': '🥩',
    'מוצרי חלב': '🥛',
    'דגנים ואפייה': '🌾',
    'שימורים ומוכנים': '🥫',
    'תבלינים ורטבים': '🧂',
    פירות: '🍎',
    קפואים: '🧊',
    'מוצרי יסוד': '🛒',
  };

  return icons[category] || '📦';
}

export default ShoppingListDisplay;
