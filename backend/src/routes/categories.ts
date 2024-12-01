import { Router } from 'express';
import { Recipe } from '../models/Recipe';

const router = Router();

router.get('/categories', async (req, res) => {
  try {
    // Fetch all unique categories from existing recipes
    const recipes = await Recipe.find({}, 'categories');
    const uniqueCategories = [...new Set(recipes.flatMap(recipe => recipe.categories || []))];
    
    res.json(uniqueCategories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router; 