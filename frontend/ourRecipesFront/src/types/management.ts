import type { SerializedRecipe } from '@/lib/serializers/recipeTypes';

export type ViewMode = 'grid' | 'list';
export type BulkAction = 'parse';

export interface RecipeListProps {
  recipes: SerializedRecipe[];
  selectedIds: number[];
  onSelect: (id: number) => void;
  onRecipeUpdate: (updatedRecipe: SerializedRecipe) => Promise<void>;
  onDelete: (recipe: SerializedRecipe) => void;
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