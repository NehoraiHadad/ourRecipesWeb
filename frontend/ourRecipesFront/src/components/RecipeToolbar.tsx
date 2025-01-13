import React from 'react';
import { useAuthContext } from '../context/AuthContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { ViewModeToggle } from '@/components/ui/ViewModeToggle';
import { ViewMode } from '@/types/management';
import { BulkAction } from '@/types/management';

interface RecipeToolbarProps {
  selectedCount: number;
  onBulkAction: (action: BulkAction, data?: any) => Promise<void>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isProcessing: boolean;
  onSort: (sortBy: string) => Promise<void>;
  onFilter: (filterBy: string) => Promise<void>;
}

const RecipeToolbar: React.FC<RecipeToolbarProps> = ({
  selectedCount,
  onBulkAction,
  viewMode,
  onViewModeChange,
  isProcessing,
  onSort,
  onFilter
}) => {
  const { authState } = useAuthContext();

  const handleSort = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    try {
      await onSort(e.target.value);
    } catch (error) {
      console.error('Failed to sort recipes:', error);
    }
  };

  const handleFilter = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    try {
      await onFilter(e.target.value);
    } catch (error) {
      console.error('Failed to filter recipes:', error);
    }
  };

  return (
    <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
      <div className="border-b border-secondary-100">
        <div className="p-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <select 
              className="text-sm border border-secondary-200 rounded-md px-3 py-1.5 bg-white 
                       hover:bg-secondary-50 text-secondary-700
                       transition-colors cursor-pointer focus:ring-2 focus:ring-primary-100 focus:border-primary-400
                       min-w-[120px] text-right"
              onChange={handleSort}
            >
              <option value="date_desc">חדש לישן</option>
              <option value="date_asc">ישן לחדש</option>
              <option value="title_asc">א-ת</option>
              <option value="title_desc">ת-א</option>
              <option value="status">לפי סטטוס</option>
            </select>

            <select 
              className="text-sm border border-secondary-200 rounded-md px-3 py-1.5 bg-white 
                       hover:bg-secondary-50 text-secondary-700
                       transition-colors cursor-pointer focus:ring-2 focus:ring-primary-100 focus:border-primary-400
                       min-w-[120px] text-right"
              onChange={handleFilter}
            >
              <option value="all">הכל</option>
              <option value="parsed">מפורסר</option>
              <option value="not_parsed">לא מפורסר</option>
              <option value="with_errors">עם שגיאות</option>
              <option value="no_errors">ללא שגיאות</option>
            </select>
          </div>

          <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
        </div>
      </div>

      <div className="p-2">
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {selectedCount > 0 ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1 rounded-md">
                <span className="w-6 h-6 flex items-center justify-center bg-primary-500 text-white text-xs font-medium rounded-full">
                  {selectedCount}
                </span>
              </div>
              
              {authState.canEdit && !isProcessing && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onBulkAction('parse')}
                    className="flex items-center gap-1.5 py-1 px-2.5 text-xs"
                  >
                    <ParseIcon />
                    <span className="whitespace-nowrap">פרסר</span>
                  </Button>
                </div>
              )}
              {isProcessing && (
                <div className="flex items-center gap-2 bg-secondary-50 px-3 py-1.5 rounded-md">
                  <LoadingSpinner size="sm" className="border-secondary-600" />
                  <span className="text-sm text-secondary-600 font-medium">מעבד...</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-secondary-500">בחר מתכונים כדי לבצע פעולות</div>
          )}
        </div>
      </div>
    </div>
  );
};

const ParseIcon = () => (
  <div className="text-sm">
    ✨
  </div>
);

export default RecipeToolbar;