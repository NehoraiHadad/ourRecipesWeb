import React from 'react';
import { useAuthContext } from '../context/AuthContext';
import Spinner from './Spinner';
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

      <div className="border-b border-gray-100">
        <div className="p-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select 
            className="text-sm border rounded-md px-3 py-1.5 bg-white hover:bg-gray-50 
                     transition-colors cursor-pointer focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                     min-w-[120px]"
            onChange={handleSort}
          >
            <option value="date_desc">חדש לישן</option>
            <option value="date_asc">ישן לחדש</option>
            <option value="title_asc">א-ת</option>
            <option value="title_desc">ת-א</option>
            <option value="status">לפי סטטוס</option>
          </select>

          {/* סינון */}
          <select 
            className="text-sm border rounded-md px-3 py-1.5 bg-white hover:bg-gray-50 
                     transition-colors cursor-pointer focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                     min-w-[120px]"
            onChange={handleFilter}
          >
            <option value="all">הכל</option>
            <option value="parsed">מפורסר</option>
            <option value="not_parsed">לא מפורסר</option>
            <option value="with_errors">עם שגיאות</option>
            <option value="no_errors">ללא שגיאות</option>
          </select>
        </div>

          {/* מעבר בין תצוגות */}
          <div className="flex items-center bg-gray-50 rounded-lg p-0.5">
            <button
              onClick={() => onViewModeChange('list')}
              className={`p-1.5 rounded-md flex items-center justify-center min-w-[32px]
                ${viewMode === 'list'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                } transition-all duration-200`}
              title="תצוגת רשימה"
            >
              <ListIcon />
            </button>
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1.5 rounded-md flex items-center justify-center min-w-[32px]
                ${viewMode === 'grid'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                } transition-all duration-200`}
              title="תצוגת גריד"
            >
              <GridIcon />
            </button>
          </div>
        </div>
      </div>

      <div className="p-2">
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {selectedCount > 0 ? (
            <>
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-md">
                <span className="w-5 h-5 flex items-center justify-center bg-blue-500 text-white text-xs font-medium rounded-full">
                  {selectedCount}
                </span>
              </div>
              
              {authState.canEdit && !isProcessing && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onBulkAction('parse')}
                    className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-md 
                             hover:bg-blue-600 transition-all duration-200 font-medium 
                             flex items-center gap-2 hover:shadow-md"
                  >
                    <ParseIcon />
                    <span className="whitespace-nowrap">פרסר</span>
                  </button>
                </div>
              )}
              {isProcessing && (
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-md">
                  <Spinner />
                  <span className="text-sm text-gray-600 font-medium">מעבד...</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-500">בחר מתכונים כדי לבצע פעולות</div>
          )}
        </div>
      </div>
    </div>
  );
};

// New Icons
const ParseIcon = () => (
  <div>
    ✨
  </div>
);

const ListIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const GridIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

export default RecipeToolbar;