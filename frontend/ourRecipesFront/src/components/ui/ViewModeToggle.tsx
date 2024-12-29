import { Button } from '@/components/ui/Button';

type ViewMode = 'grid' | 'list';

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    <div className="sticky top-0 z-10">
      <div className="flex justify-end max-w-7xl mx-auto py-1.5">
        <div className="inline-flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewModeChange('grid')}
            className={`
              rounded-md w-8 h-8 p-0 flex items-center justify-center
              ${viewMode === 'grid'
                ? 'text-primary-600 bg-primary-50' 
                : 'text-secondary-400 hover:bg-secondary-50 hover:text-secondary-600'
              }
              transition-all duration-200
            `}
            title="תצוגת גריד"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" 
              />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewModeChange('list')}
            className={`
              rounded-md w-8 h-8 p-0 flex items-center justify-center
              ${viewMode === 'list'
                ? 'text-primary-600 bg-primary-50' 
                : 'text-secondary-400 hover:bg-secondary-50 hover:text-secondary-600'
              }
              transition-all duration-200
            `}
            title="תצוגת רשימה"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M4 6h16M4 12h16M4 18h16" 
              />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
} 