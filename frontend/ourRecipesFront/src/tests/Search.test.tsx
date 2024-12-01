import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import Search from '../components/Search';

// Mock environment variable
const API_URL = 'http://test-api';
vi.stubGlobal('process', { env: { NEXT_PUBLIC_API_URL: API_URL } });

describe('Search Component', () => {
  const mockOnSearch = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for all calls
    global.fetch = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ categories: ['קינוחים', 'עוגות', 'בשרי'] })
      }))
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: {} })
      }))
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: {} })
      }));
  });

  it('fetches and displays categories on mount', async () => {
    render(<Search onSearch={mockOnSearch} />);
    
    await waitFor(() => {
      expect(screen.getByText('קינוחים')).toBeInTheDocument();
      expect(screen.getByText('עוגות')).toBeInTheDocument();
      expect(screen.getByText('בשרי')).toBeInTheDocument();
    });
  });

  it('handles search with text input', async () => {
    render(<Search onSearch={mockOnSearch} />);
    
    const searchForm = screen.getByRole('search');
    const input = screen.getByLabelText('חיפוש מתכונים');
    
    fireEvent.change(input, { target: { value: 'עוגה' } });
    fireEvent.submit(searchForm);

    await waitFor(() => {
      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      
      // First call should be categories
      expect(fetchCalls[0][0]).toBe(`${API_URL}/categories`);
      
      // Second call should be search with encoded query
      expect(fetchCalls[1][0]).toBe(
        `${API_URL}/search?query=${encodeURIComponent('עוגה')}`
      );
      
      // Third call should be telegram search with encoded query
      expect(fetchCalls[2][0]).toMatch(
        new RegExp(`${API_URL}/search/telegram\\?query=${encodeURIComponent('עוגה')}&existing_ids\\[\\]=`)
      );
    });
  });

  it('handles search with category selection', async () => {
    render(<Search onSearch={mockOnSearch} />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('קינוחים'));
    });

    const searchForm = screen.getByRole('search');
    fireEvent.submit(searchForm);

    await waitFor(() => {
      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      
      // Second call should include category
      expect(fetchCalls[1][0]).toBe(
        `${API_URL}/search?query=&categories=קינוחים`
      );
    });
  });

  it('performs search with both text and categories', async () => {
    render(<Search onSearch={mockOnSearch} />);
    
    const searchForm = screen.getByRole('search');
    const input = screen.getByLabelText('חיפוש מתכונים');
    
    fireEvent.change(input, { target: { value: 'עוגה' } });
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('קינוחים'));
    });
    
    fireEvent.submit(searchForm);

    await waitFor(() => {
      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      
      // Second call should include both encoded query and category
      expect(fetchCalls[1][0]).toBe(
        `${API_URL}/search?query=${encodeURIComponent('עוגה')}&categories=קינוחים`
      );
    });
  });

  it('handles category fetch error', async () => {
    global.fetch = vi.fn().mockImplementation(() => 
      Promise.reject(new Error('Failed to fetch'))
    );
    
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<Search onSearch={mockOnSearch} />);
    
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Error fetching categories:',
        expect.any(Error)
      );
    });
  });
}); 