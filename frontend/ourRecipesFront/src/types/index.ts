export interface Category {
  id: number;
  name: string;
  description?: string;
  image?: string;
}

export interface recipe {
  id: number;
  title: string;
  details: string;
  ingredients: string[];
  image: string;
  time: number;
  categories?: number[];
}
