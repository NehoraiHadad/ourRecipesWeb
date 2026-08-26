import React from 'react';
import { LightbulbIcon, ChartBarIcon } from '@/components/ui/icons';
import { ClockIcon } from '@/components/ui/ClockIcon';
import type { PlannedCourse } from '@/types';

/**
 * One course row — the dish, why the planner picked it, and its timings.
 *
 * Shared by the saved menu (`MenuDisplay`) and the AI preview
 * (`MenuGenerator`): both used to keep their own copy of this markup, which is
 * how the preview's copy quietly rendered every course as "מתכון לא זמין"
 * while the saved one was fine. The two differ only in what they let you do
 * with a course, so the actions come in as a slot.
 */
interface MealCourseCardProps {
  course: PlannedCourse;
  /** Called with the recipe's `telegram_id` — the key the recipe page looks up by. */
  onOpenRecipe?: (telegramId?: number) => void;
  actions?: React.ReactNode;
}

export const MealCourseCard: React.FC<MealCourseCardProps> = ({ course, onOpenRecipe, actions }) => {
  const recipe = course.recipe;
  const clickable = Boolean(onOpenRecipe);

  return (
    <div
      className={`flex items-start gap-4 p-4 bg-secondary-50 rounded-lg hover:bg-secondary-100 transition-colors${
        clickable ? ' cursor-pointer' : ''
      }`}
      onClick={clickable ? () => onOpenRecipe?.(recipe?.telegram_id) : undefined}
    >
      {recipe?.image_url && (
        <img src={recipe.image_url} alt={recipe.title} className="w-20 h-20 object-cover rounded-md" />
      )}
      <div className="flex-1">
        <h3
          className={`text-lg font-semibold text-secondary-800${
            clickable ? ' hover:text-primary-600 transition-colors' : ''
          }`}
        >
          {recipe?.title || 'מתכון לא זמין'}
        </h3>
        {course.course_type && <p className="text-sm text-secondary-500 mt-1">{course.course_type}</p>}
        {course.ai_reason && (
          <p className="text-sm text-secondary-600 mt-1 flex items-start gap-1">
            <LightbulbIcon size="xs" className="flex-shrink-0 mt-0.5" />
            <span>{course.ai_reason}</span>
          </p>
        )}
        <div className="flex gap-3 mt-2 text-xs text-secondary-500">
          {recipe?.cooking_time && (
            <span className="flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              {recipe.cooking_time} דק׳
            </span>
          )}
          {recipe?.difficulty && (
            <span className="flex items-center gap-1">
              <ChartBarIcon size="xs" />
              {recipe.difficulty}
            </span>
          )}
          {recipe?.servings && <span>👥 {recipe.servings} מנות</span>}
        </div>
      </div>
      {actions && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
};

export default MealCourseCard;
