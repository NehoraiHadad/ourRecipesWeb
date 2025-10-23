import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { menuService } from '@/services/menuService';
import { useNotification } from '@/context/NotificationContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import type { DietaryType, MenuGenerationRequest } from '@/types';

interface MenuGeneratorProps {
  onMenuCreated?: (menuId: number) => void;
}

const MenuGenerator: React.FC<MenuGeneratorProps> = ({ onMenuCreated }) => {
  const router = useRouter();
  const { addNotification } = useNotification();

  // Form state
  const [name, setName] = useState<string>('');
  const [eventType, setEventType] = useState<string>('שבת');
  const [servings, setServings] = useState<number>(4);
  const [dietaryType, setDietaryType] = useState<DietaryType | ''>('');
  const [mealTypes, setMealTypes] = useState<string[]>(['ארוחת ערב שבת']);
  const [specialRequests, setSpecialRequests] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  // Loading state
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Preview state
  const [menuPreview, setMenuPreview] = useState<any>(null);
  const [previewPreferences, setPreviewPreferences] = useState<MenuGenerationRequest | null>(null);

  // Predefined options
  const eventTypes = [
    'שבת',
    'חג',
    'ארוחה משפחתית',
    'אירוע מיוחד',
    'יום הולדת',
    'אחר'
  ];

  const mealTypeOptions = [
    'ארוחת ערב שבת',
    'ארוחת בוקר',
    'ארוחת צהריים',
    'סעודה שלישית',
    'ארוחת ערב',
    'קידוש',
  ];

  const dietaryTypes: { value: DietaryType; label: string }[] = [
    { value: 'meat', label: 'בשרי' },
    { value: 'dairy', label: 'חלבי' },
    { value: 'pareve', label: 'פרווה' },
  ];

  const handleMealTypeToggle = (meal: string) => {
    setMealTypes((prev) =>
      prev.includes(meal)
        ? prev.filter((m) => m !== meal)
        : [...prev, meal]
    );
  };

  const handleGenerate = async () => {
    // Validation
    if (!name.trim()) {
      setError('נא להזין שם לתפריט');
      return;
    }

    if (mealTypes.length === 0) {
      setError('נא לבחור לפחות ארוחה אחת');
      return;
    }

    setLoading(true);
    setError('');
    setMenuPreview(null);

    try {
      const request: MenuGenerationRequest = {
        name: name.trim(),
        event_type: eventType,
        servings,
        dietary_type: dietaryType || undefined,
        meal_types: mealTypes,
        special_requests: specialRequests.trim() || undefined,
        description: description.trim() || undefined,
      };

      // Generate PREVIEW first (not saved yet)
      const response = await menuService.generateMenuPreview(request);

      if (response.preview) {
        setMenuPreview(response.preview);
        setPreviewPreferences(request);
        addNotification({ message: 'התפריט נוצר! בדוק ולחץ על "אשר ושמור"', type: 'success' });
      } else {
        throw new Error('No preview returned from server');
      }
    } catch (err: any) {
      console.error('Error generating menu preview:', err);

      let errorMessage = 'שגיאה ביצירת התפריט';

      // Handle specific error types
      if (err.message?.includes('timeout') || err.message?.includes('took too long')) {
        errorMessage = 'יצירת התפריט לוקחת זמן רב. נסה שוב.';
      } else if (err.message?.includes('Not enough recipes')) {
        errorMessage = 'אין מספיק מתכונים במאגר כדי ליצור תפריט. נדרשים לפחות 5 מתכונים.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      addNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAndSave = async () => {
    if (!menuPreview || !previewPreferences) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await menuService.saveMenu(menuPreview, previewPreferences);

      if (response.menu) {
        addNotification({ message: 'התפריט נשמר בהצלחה!', type: 'success' });

        if (onMenuCreated) {
          onMenuCreated(response.menu.id);
        } else {
          // Navigate to the menu display page
          router.push(`/menus/${response.menu.id}`);
        }
      } else {
        throw new Error('No menu returned from server');
      }
    } catch (err: any) {
      console.error('Error saving menu:', err);
      setError(err.message || 'שגיאה בשמירת התפריט');
      addNotification({ message: 'שגיאה בשמירת התפריט', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPreview = () => {
    setMenuPreview(null);
    setPreviewPreferences(null);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-warm">
      <h2 className="text-2xl font-bold mb-6 text-secondary-800">
        יצירת תפריט חדש
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Menu name */}
        <div>
          <label className="block text-sm font-medium mb-2 text-secondary-700">
            שם התפריט *
          </label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: תפריט שבת משפחתי"
            disabled={loading}
            className="w-full"
          />
        </div>

        {/* Event type */}
        <div>
          <label className="block text-sm font-medium mb-2 text-secondary-700">
            סוג אירוע
          </label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            disabled={loading}
            className="w-full p-2 border border-secondary-200 rounded-lg
                     bg-white text-secondary-900
                     focus:ring-2 focus:ring-primary-100 transition-all"
          >
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Servings */}
        <div>
          <label className="block text-sm font-medium mb-2 text-secondary-700">
            מספר סועדים
          </label>
          <Input
            type="number"
            min="1"
            max="50"
            value={servings}
            onChange={(e) => setServings(parseInt(e.target.value) || 4)}
            disabled={loading}
            className="w-full"
          />
        </div>

        {/* Dietary type */}
        <div>
          <label className="block text-sm font-medium mb-2 text-secondary-700">
            סוג כשרות
          </label>
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setDietaryType('')}
              disabled={loading}
              className={`px-4 py-2 rounded-lg transition-all ${
                dietaryType === ''
                  ? 'bg-primary-500 text-white shadow-warm hover:bg-primary-600'
                  : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
              }`}
            >
              כללי
            </button>
            {dietaryTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setDietaryType(type.value)}
                disabled={loading}
                className={`px-4 py-2 rounded-lg transition-all ${
                  dietaryType === type.value
                    ? 'bg-primary-500 text-white shadow-warm hover:bg-primary-600'
                    : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Meal types */}
        <div>
          <label className="block text-sm font-medium mb-2 text-secondary-700">
            ארוחות לתכנן *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {mealTypeOptions.map((meal) => (
              <button
                key={meal}
                type="button"
                onClick={() => handleMealTypeToggle(meal)}
                disabled={loading}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${
                  mealTypes.includes(meal)
                    ? 'bg-primary-500 text-white shadow-warm hover:bg-primary-600'
                    : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
                }`}
              >
                {meal}
              </button>
            ))}
          </div>
          <p className="text-xs text-secondary-500 mt-1">
            נבחרו {mealTypes.length} ארוחות
          </p>
        </div>

        {/* Special requests */}
        <div>
          <label className="block text-sm font-medium mb-2 text-secondary-700">
            דרישות מיוחדות (אופציונלי)
          </label>
          <textarea
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            placeholder="למשל: ללא אורז, מתאים לילדים, ללא גלוטן..."
            disabled={loading}
            rows={2}
            className="w-full p-2 border border-secondary-200 rounded-lg
                     bg-white text-secondary-900
                     focus:ring-2 focus:ring-primary-100 resize-none transition-all"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-2 text-secondary-700">
            תיאור (אופציונלי)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="תיאור כללי של התפריט..."
            disabled={loading}
            rows={2}
            className="w-full p-2 border border-secondary-200 rounded-lg
                     bg-white text-secondary-900
                     focus:ring-2 focus:ring-primary-100 resize-none transition-all"
          />
        </div>

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={loading || saving || !!menuPreview || !name.trim() || mealTypes.length === 0}
          variant="primary"
          size="lg"
          className="w-full"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <Spinner size="sm" />
              <span>מייצר תפריט...</span>
            </div>
          ) : (
            'צור תפריט (תצוגה מקדימה)'
          )}
        </Button>
      </div>

      {loading && (
        <div className="mt-4 p-4 bg-primary-50 rounded-lg border border-primary-200">
          <p className="text-sm text-primary-700 font-medium">
            🤖 ה-AI עובד על יצירת תפריט מאוזן והגיוני עבורך...
          </p>
          <p className="text-xs text-primary-600 mt-2">
            ⏱️ זה עשוי לקחת 30-60 שניות
          </p>
          <p className="text-xs text-primary-600 mt-1">
            ה-AI מחפש מתכונים מתאימים ומוודא איזון נכון בין מנות
          </p>
        </div>
      )}

      {/* Preview Section */}
      {menuPreview && !loading && (
        <div className="mt-6 border-t pt-6">
          <h3 className="text-xl font-bold mb-4 text-secondary-800">
            תצוגה מקדימה - בדוק את התפריט
          </h3>

          <div className="space-y-6 mb-6">
            {menuPreview.meals?.map((meal: any, index: number) => (
              <div key={index} className="bg-white rounded-lg shadow-warm p-6 border border-secondary-100">
                <h4 className="text-xl font-bold text-secondary-800 mb-4">
                  {meal.meal_type}
                  {meal.meal_time && (
                    <span className="text-sm text-secondary-500 mr-2">
                      ({meal.meal_time})
                    </span>
                  )}
                </h4>

                <div className="space-y-4">
                  {meal.recipes?.map((mealRecipe: any, rIndex: number) => (
                    <div
                      key={rIndex}
                      className="flex items-start gap-4 p-4 bg-secondary-50 rounded-lg hover:bg-secondary-100 transition-colors"
                    >
                      {mealRecipe.recipe?.image_url && (
                        <img
                          src={mealRecipe.recipe.image_url}
                          alt={mealRecipe.recipe?.title}
                          className="w-20 h-20 object-cover rounded-md"
                        />
                      )}
                      <div className="flex-1">
                        <h5 className="text-lg font-semibold text-secondary-800">
                          {mealRecipe.recipe?.title || 'מתכון לא זמין'}
                        </h5>
                        {mealRecipe.course_type && (
                          <p className="text-sm text-secondary-500 mt-1">
                            סוג: {mealRecipe.course_type}
                          </p>
                        )}
                        {mealRecipe.ai_reason && (
                          <p className="text-sm text-secondary-600 mt-1">
                            💡 {mealRecipe.ai_reason}
                          </p>
                        )}
                        <div className="flex gap-3 mt-2 text-xs text-secondary-500">
                          {mealRecipe.recipe?.cooking_time && (
                            <span>⏱️ {mealRecipe.recipe.cooking_time} דק׳</span>
                          )}
                          {mealRecipe.recipe?.difficulty && (
                            <span>📊 {mealRecipe.recipe.difficulty}</span>
                          )}
                          {mealRecipe.recipe?.servings && (
                            <span>👥 {mealRecipe.recipe.servings} מנות</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {menuPreview.reasoning && (
            <div className="bg-primary-50 rounded-lg p-4 mb-6 border border-primary-200">
              <p className="text-sm text-primary-700">
                <span className="font-semibold">🤖 הסבר ה-AI:</span> {menuPreview.reasoning}
              </p>
            </div>
          )}

          {/* Confirm/Cancel buttons */}
          <div className="flex gap-4">
            <Button
              onClick={handleConfirmAndSave}
              disabled={saving}
              variant="primary"
              size="lg"
              className="flex-1"
            >
              {saving ? (
                <div className="flex items-center justify-center gap-2">
                  <Spinner size="sm" />
                  <span>שומר...</span>
                </div>
              ) : (
                '✓ אשר ושמור את התפריט'
              )}
            </Button>
            <Button
              onClick={handleCancelPreview}
              disabled={saving}
              variant="secondary"
              size="lg"
              className="flex-1"
            >
              ✕ בטל וצור מחדש
            </Button>
          </div>

          <p className="text-xs text-secondary-500 mt-4 text-center">
            💡 טיפ: לאחר השמירה תוכל להחליף מתכונים בעמוד התפריט
          </p>
        </div>
      )}
    </div>
  );
};

export default MenuGenerator;
