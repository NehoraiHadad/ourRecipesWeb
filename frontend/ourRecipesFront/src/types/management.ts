import { recipe } from './index';

export type ViewMode = 'grid' | 'list';
export type BulkAction = 'parse';

export interface RecipeListProps {
  recipes: recipe[];
  selectedIds: number[];
  onSelect: (id: number) => void;
  onRecipeUpdate: (updatedRecipe: recipe) => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  observerTarget?: React.RefObject<HTMLDivElement>;
}

export interface RecipeGridProps extends RecipeListProps {}

export interface RecipeToolbarProps {
  selectedCount: number;
  onBulkAction: (action: BulkAction, data?: any) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isProcessing: boolean;
} 