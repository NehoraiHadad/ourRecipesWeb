import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The Search screen after the Wave 2.A cutover: it talks to the local
 * `/api/...` routes through `apiService` (no external base URL, no direct
 * `fetch`), so these tests assert on the endpoint each service hits and on the
 * `{ [telegram_id]: recipe }` map the component hands back to its parent.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })
}));

// The mocked hooks must return *stable* objects: Search memoizes callbacks on
// `addNotification`, so a fresh identity per render would loop forever.
vi.mock('@/context/NotificationContext', () => {
  const value = { addNotification: vi.fn() };
  return { useNotification: () => value };
});

vi.mock('@/context/FontContext', () => {
  const value = { currentFont: 'default', setFont: vi.fn(), fonts: [] };
  return { useFont: () => value };
});

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

import Search from '../components/Search';
import { apiService } from '@/services/apiService';

const getMock = vi.mocked(apiService.get);

const SEARCH_ROW = {
  id: 7,
  telegram_id: 4242,
  title: 'עוגת שוקולד',
  raw_content: 'כותרת: עוגת שוקולד\nרשימת מצרכים:\n-קמח',
  categories: 'קינוחים,עוגות',
  difficulty: 'EASY',
  preparation_time: 30,
  image_url: null,
  created_at: '2024-01-01T00:00:00.000Z'
};

function mockEndpoints() {
  getMock.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('/api/categories')) {
      return Promise.resolve({ data: ['קינוחים', 'עוגות'] }) as any;
    }
    if (endpoint.startsWith('/api/recipes/search/suggestions')) {
      return Promise.resolve({ data: ['עוגת שוקולד'] }) as any;
    }
    if (endpoint.startsWith('/api/recipes/search')) {
      return Promise.resolve({
        data: [SEARCH_ROW],
        pagination: { page: 1, pageSize: 20, totalPages: 1, totalItems: 1 }
      }) as any;
    }
    return Promise.resolve({ data: [] }) as any;
  });
}

function calledEndpoints(): string[] {
  return getMock.mock.calls.map((call) => String(call[0]));
}

describe('Search Component', () => {
  const mockOnSearch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockEndpoints();
  });

  it('loads the category list from /api/categories', async () => {
    render(<Search onSearch={mockOnSearch} />);

    await waitFor(() => {
      expect(calledEndpoints()).toContain('/api/categories');
    });

    await waitFor(() => {
      expect(screen.getByText('קינוחים')).toBeInTheDocument();
    });
  });

  it('requests suggestions from /api/recipes/search/suggestions while typing', async () => {
    render(<Search onSearch={mockOnSearch} />);

    await userEvent.type(screen.getByPlaceholderText('חיפוש...'), 'עוגה');

    await waitFor(() => {
      expect(
        calledEndpoints().some((endpoint) =>
          endpoint.startsWith(`/api/recipes/search/suggestions?q=${encodeURIComponent('עוגה')}`)
        )
      ).toBe(true);
    });
  });

  it('searches /api/recipes/search with the typed query', async () => {
    render(<Search onSearch={mockOnSearch} />);

    await userEvent.type(screen.getByPlaceholderText('חיפוש...'), 'עוגה');
    // Submitting the form is the reliable trigger — the search button is icon-only.
    const form = document.querySelector('form[role="search"]') as HTMLFormElement;
    form.requestSubmit();

    await waitFor(() => {
      expect(
        calledEndpoints().some(
          (endpoint) => endpoint === `/api/recipes/search?query=${encodeURIComponent('עוגה')}`
        )
      ).toBe(true);
    });
  });

  it('passes a selected category through as the `categories` query param', async () => {
    render(<Search onSearch={mockOnSearch} />);

    await waitFor(() => expect(screen.getByText('קינוחים')).toBeInTheDocument());
    await userEvent.click(screen.getByText('קינוחים'));

    const form = document.querySelector('form[role="search"]') as HTMLFormElement;
    form.requestSubmit();

    await waitFor(() => {
      expect(
        calledEndpoints().some(
          (endpoint) =>
            endpoint === `/api/recipes/search?categories=${encodeURIComponent('קינוחים')}`
        )
      ).toBe(true);
    });
  });

  it('keeps every selected category, not just the first one', async () => {
    render(<Search onSearch={mockOnSearch} />);

    await waitFor(() => expect(screen.getByText('קינוחים')).toBeInTheDocument());
    await userEvent.click(screen.getByText('קינוחים'));
    await userEvent.click(screen.getByText('עוגות'));

    const form = document.querySelector('form[role="search"]') as HTMLFormElement;
    form.requestSubmit();

    await waitFor(() => {
      expect(
        calledEndpoints().some(
          (endpoint) =>
            endpoint === `/api/recipes/search?categories=${encodeURIComponent('קינוחים,עוגות')}`
        )
      ).toBe(true);
    });
  });

  it('sends the advanced filters (prep time, difficulty, include/exclude terms)', async () => {
    render(<Search onSearch={mockOnSearch} />);

    // The advanced panel is behind the icon-only sliders button.
    await userEvent.click(screen.getByLabelText('חיפוש מתקדם'));

    await userEvent.selectOptions(screen.getByLabelText('זמן הכנה:'), '30');
    await userEvent.selectOptions(screen.getByLabelText('רמת קושי:'), 'easy');
    await userEvent.type(screen.getByLabelText('חייב להכיל:'), 'שוקולד, אגוזים');
    await userEvent.type(screen.getByLabelText('לא להכיל:'), 'חמאה');

    const form = document.querySelector('form[role="search"]') as HTMLFormElement;
    form.requestSubmit();

    await waitFor(() => {
      expect(
        calledEndpoints().some((endpoint) => endpoint.startsWith('/api/recipes/search?'))
      ).toBe(true);
    });

    const searchCall = calledEndpoints()
      .filter(
        (endpoint) =>
          endpoint.startsWith('/api/recipes/search?') &&
          !endpoint.startsWith('/api/recipes/search/suggestions')
      )
      .at(-1) as string;
    const sent = new URLSearchParams(searchCall.split('?')[1]);

    expect(sent.get('maxPrepTime')).toBe('30');
    expect(sent.get('difficulty')).toBe('EASY');
    expect(sent.get('includeTerms')).toBe('שוקולד,אגוזים');
    expect(sent.get('excludeTerms')).toBe('חמאה');
  });

  it('maps the paginated response onto a telegram_id-keyed recipe map', async () => {
    render(<Search onSearch={mockOnSearch} />);

    const form = document.querySelector('form[role="search"]') as HTMLFormElement;
    form.requestSubmit();

    await waitFor(() => {
      expect(mockOnSearch).toHaveBeenCalled();
    });

    const results = mockOnSearch.mock.calls.at(-1)?.[0];
    expect(Object.keys(results)).toEqual(['4242']);
    expect(results['4242']).toMatchObject({
      id: 7,
      telegram_id: 4242,
      title: 'עוגת שוקולד',
      // Prisma column names translated for the UI.
      categories: ['קינוחים', 'עוגות'],
      difficulty: 'easy'
    });
  });
});
