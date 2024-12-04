import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Search from '../components/Search';

const API_URL = 'http://test-api';
vi.stubGlobal('process', { env: { NEXT_PUBLIC_API_URL: API_URL } });

describe('Search Component', () => {
  const mockOnSearch = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(['קינוחים', 'עוגות'])
      }))
      .mockImplementation(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      }));
  });

  it('handles search with text input', async () => {
    render(<Search onSearch={mockOnSearch} />);
    
    const searchInput = screen.getByLabelText('חיפוש מתכונים');
    await userEvent.type(searchInput, 'עוגת שוקולד');
    
    await userEvent.click(screen.getByLabelText('חפש'));

    await waitFor(() => {
      const expectedUrl = `${API_URL}/search?query=${encodeURIComponent('עוגת שוקולד').replace(/%20/g, '+')}`;
      expect(global.fetch).toHaveBeenNthCalledWith(2, expectedUrl, expect.any(Object));
    });
  });

  it('handles search with category selection', async () => {
    render(<Search onSearch={mockOnSearch} />);
    
    const searchInput = screen.getByLabelText('חיפוש מתכונים');
    await userEvent.click(searchInput);
    
    await waitFor(() => {
      const categoryButton = screen.getByText('קינוחים');
      userEvent.click(categoryButton);
    });

    await userEvent.click(screen.getByLabelText('חפש'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(2,
        `${API_URL}/search?categories=${encodeURIComponent('קינוחים')}`,
        expect.any(Object)
      );
    });
  });

  it('performs search with both text and categories', async () => {
    render(<Search onSearch={mockOnSearch} />);
    
    const searchInput = screen.getByLabelText('חיפוש מתכונים');
    await userEvent.type(searchInput, 'עוגה');
    
    await userEvent.click(searchInput);
    await waitFor(() => {
      const categoryButton = screen.getByText('קינוחים');
      userEvent.click(categoryButton);
    });

    await userEvent.click(screen.getByLabelText('חפש'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(2,
        `${API_URL}/search?query=${encodeURIComponent('עוגה')}&categories=${encodeURIComponent('קינוחים')}`,
        expect.any(Object)
      );
    });
  });

  // ... rest of tests
}); 