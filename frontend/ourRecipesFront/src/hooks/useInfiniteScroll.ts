import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseInfiniteScrollOptions<T> {
  items: T[];
  itemsPerPage?: number;
  initialPage?: number;
  threshold?: number; // Intersection observer threshold (0-1)
}

export function useInfiniteScroll<T>({
  items,
  itemsPerPage = 20,
  initialPage = 1,
  threshold = 0.1
}: UseInfiniteScrollOptions<T>) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [displayedItems, setDisplayedItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Calculate total pages
  const totalPages = Math.ceil(items.length / itemsPerPage);

  // Load initial items
  useEffect(() => {
    const initialItems = items.slice(0, itemsPerPage * initialPage);
    setDisplayedItems(initialItems);
    setHasMore(initialItems.length < items.length);
  }, [items, itemsPerPage, initialPage]);

  // Load more items
  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);

    // Simulate async loading (you can replace with actual API call)
    setTimeout(() => {
      const nextPage = currentPage + 1;
      const startIndex = 0;
      const endIndex = nextPage * itemsPerPage;
      const newItems = items.slice(startIndex, endIndex);

      setDisplayedItems(newItems);
      setCurrentPage(nextPage);
      setHasMore(newItems.length < items.length);
      setIsLoading(false);
    }, 300); // Small delay for smooth UX
  }, [currentPage, items, itemsPerPage, hasMore, isLoading]);

  // Intersection Observer setup
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold, rootMargin: '100px' } // Start loading 100px before reaching the bottom
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [loadMore, hasMore, isLoading, threshold]);

  // Reset when items change (e.g., search/filter)
  useEffect(() => {
    setCurrentPage(initialPage);
    const initialItems = items.slice(0, itemsPerPage * initialPage);
    setDisplayedItems(initialItems);
    setHasMore(initialItems.length < items.length);
  }, [items.length]); // Only reset when the number of items changes

  const reset = useCallback(() => {
    setCurrentPage(initialPage);
    const initialItems = items.slice(0, itemsPerPage * initialPage);
    setDisplayedItems(initialItems);
    setHasMore(initialItems.length < items.length);
  }, [items, itemsPerPage, initialPage]);

  return {
    displayedItems,
    hasMore,
    isLoading,
    observerTarget,
    currentPage,
    totalPages,
    loadMore,
    reset,
    totalItems: items.length,
    displayedCount: displayedItems.length
  };
}
