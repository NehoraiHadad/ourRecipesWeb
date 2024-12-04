import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionHistory from '../VersionHistory';

describe('VersionHistory Component', () => {
  const mockRecipeId = 123;
  const mockOnRestore = vi.fn();
  const mockOnClose = vi.fn();
  
  const mockVersions = [
    {
      id: 1,
      version_num: 2,
      content: {
        title: "מתכון מעודכן",
        raw_content: "כותרת: מתכון מעודכן\nרשימת מצרכים:\n- קמח\n- סוכר\nהוראות הכנה:\n1. לערבב",
        categories: ["קינוחים"],
        ingredients: ["קמח", "סוכר"],
        instructions: "1. לערבב"
      },
      created_at: "2024-01-01T12:00:00",
      created_by: "user1",
      change_description: "שיפור המתכון",
      is_current: true,
      image: null
    },
    {
      id: 2,
      version_num: 1,
      content: {
        title: "מתכון מקורי",
        raw_content: "מתכון פשוט",
        categories: [],
        ingredients: [],
        instructions: ""
      },
      created_at: "2024-01-01T10:00:00",
      created_by: "user1",
      change_description: "גרסה ראשונה",
      is_current: false,
      image: null
    }
  ];

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockVersions)
      })
    );
  });

  it('shows version content when expanded', async () => {
    render(
      <VersionHistory 
        recipeId={mockRecipeId}
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    // מחכים שהתוכן יטען
    await waitFor(() => {
      expect(screen.getByText(/גרסה ראשונה/)).toBeInTheDocument();
    });

    // מוצאים את הגרסה הראשונה ולוחצים על כפתור "הצג תוכן"
    const firstVersion = screen.getByText(/גרסה ראשונה/).closest('.bg-white') as HTMLElement;
    expect(firstVersion).toBeInTheDocument();
    
    const expandButton = within(firstVersion).getByRole('button', { name: /הצג תוכן/ });
    await userEvent.click(expandButton);

    // בודקים שהתוכן מוצג
    await waitFor(() => {
      expect(screen.getByText(/כותרת:/)).toBeInTheDocument();
      expect(screen.getByText('מתכון מקורי')).toBeInTheDocument();
    });
  });

  it('displays formatted dates correctly', async () => {
    render(
      <VersionHistory 
        recipeId={mockRecipeId}
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      // בכיוון שאנחנו משתמשים ב-toLocaleString('he-IL'),
      // נבדוק שהתאריך מופיע בפורמט הישראלי
      const expectedDate = new Date('2024-01-01T12:00:00').toLocaleString('he-IL');
      const dateElement = screen.getByText(expectedDate);
      expect(dateElement).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('API Error'));

    render(
      <VersionHistory 
        recipeId={mockRecipeId}
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('שגיאה בטעינת היסטוריית גרסאות')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  it('restores version successfully', async () => {
    render(
      <VersionHistory 
        recipeId={mockRecipeId}
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      const restoreButton = screen.getByText('שחזר גרסה זו');
      expect(restoreButton).toBeInTheDocument();
    });

    const restoreButton = screen.getByText('שחזר גרסה זו');
    await userEvent.click(restoreButton);
    
    expect(mockOnRestore).toHaveBeenCalledWith(2); // ID של הגרסה הישנה
  });

  it('marks current version correctly', async () => {
    render(
      <VersionHistory 
        recipeId={mockRecipeId}
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('נוכחי')).toBeInTheDocument();
      const currentVersion = screen.getByText(/שיפור המתכון/).closest('.bg-white') as HTMLElement;
      expect(within(currentVersion).queryByText('שחזר גרסה זו')).not.toBeInTheDocument();
    });
  });
});