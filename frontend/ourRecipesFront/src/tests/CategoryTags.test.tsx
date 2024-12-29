import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import CategoryTags from '../components/CategoryTags';

describe('CategoryTags Component', () => {
  const mockCategories = ['קינוחים', 'עוגות', 'בשרי'];
  const mockOnClick = vi.fn();

  it('renders all categories', () => {
    render(<CategoryTags categories={mockCategories} />);
    
    mockCategories.forEach(category => {
      expect(screen.getByText(category)).toBeInTheDocument();
    });
  });

  it('handles category selection correctly', () => {
    render(
      <CategoryTags 
        categories={mockCategories} 
        selectedCategories={['קינוחים']} 
        onClick={mockOnClick} 
      />
    );

    const selectedTag = screen.getByText('קינוחים');
    expect(selectedTag).toHaveClass('bg-brown');
    expect(selectedTag).toHaveClass('text-white');
  });

  it('calls onClick handler when category is clicked', () => {
    render(
      <CategoryTags 
        categories={mockCategories} 
        onClick={mockOnClick} 
      />
    );

    fireEvent.click(screen.getByText('עוגות'));
    expect(mockOnClick).toHaveBeenCalledWith('עוגות');
  });

  it('handles empty categories array', () => {
    render(<CategoryTags categories={[]} />);
    expect(screen.queryByRole('span')).not.toBeInTheDocument();
  });
}); 