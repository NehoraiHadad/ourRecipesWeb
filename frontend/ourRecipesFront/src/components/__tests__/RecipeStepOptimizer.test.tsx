import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * `POST /api/recipes/optimize-steps` now answers the validated structured plan
 * (`{ data: OptimizedSteps }`), so the component renders the rich view
 * directly — there is no JSON-sniffing fallback left. What remains to pin
 * down is that the rich view is driven by the payload and that an upstream
 * failure lands in the error state with the button still available.
 */
vi.mock('@/components/ui/FeatureIndicator', () => ({
  FeatureIndicator: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock('@/services/apiService', () => ({
  apiService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

import RecipeStepOptimizer from '../recipe/RecipeStepOptimizer';
import { apiService } from '@/services/apiService';

const postMock = vi.mocked(apiService.post);

const PLAN = {
  optimized_steps: [
    {
      step_group: 'הכנת הבצק',
      parallel_steps: [
        { description: 'לערבב קמח וסוכר', estimated_time: '5', dependencies: [] },
        {
          description: 'לחמם את התנור',
          estimated_time: '10',
          dependencies: ['לערבב קמח וסוכר']
        }
      ]
    }
  ],
  prep_ahead_steps: [{ description: 'להכין את הקרם', max_prep_time: '24' }],
  total_sequential_time: '45',
  total_optimized_time: '30',
  time_saved: '15'
};

const RECIPE_TEXT = 'כותרת: עוגת שוקולד\nהוראות הכנה:\n1. לערבב';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RecipeStepOptimizer', () => {
  it('renders the structured plan the route returns', async () => {
    postMock.mockResolvedValue({ data: PLAN } as any);

    render(<RecipeStepOptimizer recipeText={RECIPE_TEXT} />);
    await userEvent.click(screen.getByRole('button', { name: /ייעול זמני הכנה/ }));

    await waitFor(() => {
      expect(screen.getByText('הכנת הבצק')).toBeInTheDocument();
    });

    expect(postMock).toHaveBeenCalledWith(
      '/api/recipes/optimize-steps',
      { recipeText: RECIPE_TEXT },
      expect.objectContaining({ timeout: expect.any(Number) })
    );

    // Totals headline.
    expect(screen.getByText(/זמן מקורי: 45/)).toBeInTheDocument();
    expect(screen.getByText(/זמן מיועל: 30/)).toBeInTheDocument();
    expect(screen.getByText(/חסכון: 15/)).toBeInTheDocument();

    // Prepare-ahead block.
    expect(screen.getByText('להכין את הקרם')).toBeInTheDocument();
    expect(screen.getByText(/ניתן להכין עד 24 שעות מראש/)).toBeInTheDocument();

    // Parallel steps, with their estimates and dependencies.
    expect(screen.getByText('לערבב קמח וסוכר')).toBeInTheDocument();
    expect(screen.getByText('לחמם את התנור')).toBeInTheDocument();
    expect(screen.getByText(/זמן משוער: 10/)).toBeInTheDocument();
    expect(screen.getByText(/תלוי ב: לערבב קמח וסוכר/)).toBeInTheDocument();
  });

  it('omits the prepare-ahead block when there is nothing to prepare ahead', async () => {
    postMock.mockResolvedValue({ data: { ...PLAN, prep_ahead_steps: [] } } as any);

    render(<RecipeStepOptimizer recipeText={RECIPE_TEXT} />);
    await userEvent.click(screen.getByRole('button', { name: /ייעול זמני הכנה/ }));

    await waitFor(() => {
      expect(screen.getByText('הכנת הבצק')).toBeInTheDocument();
    });
    expect(screen.queryByText('הכנות מראש')).not.toBeInTheDocument();
  });

  it('shows the server error when the route rejects a non-conforming plan', async () => {
    postMock.mockRejectedValue(
      new Error('The optimization service returned an unusable plan')
    );

    render(<RecipeStepOptimizer recipeText={RECIPE_TEXT} />);
    await userEvent.click(screen.getByRole('button', { name: /ייעול זמני הכנה/ }));

    await waitFor(() => {
      expect(
        screen.getByText('The optimization service returned an unusable plan')
      ).toBeInTheDocument();
    });

    // No half-rendered plan, and the user can try again.
    expect(screen.queryByText('הכנת הבצק')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ייעול זמני הכנה/ })).toBeInTheDocument();
  });

  it('refuses to call the API without recipe text', async () => {
    render(<RecipeStepOptimizer recipeText="" />);
    await userEvent.click(screen.getByRole('button', { name: /ייעול זמני הכנה/ }));

    await waitFor(() => {
      expect(screen.getByText('לא נמצא טקסט מתכון לניתוח')).toBeInTheDocument();
    });
    expect(postMock).not.toHaveBeenCalled();
  });
});
