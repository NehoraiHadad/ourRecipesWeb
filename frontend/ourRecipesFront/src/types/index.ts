export type Difficulty = "easy" | "medium" | "hard";

export interface recipe {
  id: number;
  telegram_id: number;
  title: string;
  raw_content: string;
  details: string;
  categories: string[];
  difficulty?: Difficulty;
  preparation_time?: number;
  ingredients?: string[];
  instructions?: string[] | string;
  is_parsed: boolean;
  parse_errors: string | null;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  image?: string;
}

export interface RecipeVersion {
  id: number;
  recipe_id: number;
  content: {
    title: string;
    raw_content: string;
    categories?: string[];
    ingredients?: string[];
    instructions?: string;
  };
  created_at: string;
  created_by: string;
  change_description?: string;
  is_current: boolean;
  image?: string | null;
}
