// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { imageSrc } from '@/utils/imageSrc';

describe('imageSrc', () => {
  it('passes an https Blob URL through untouched — the recipe-modal bug', () => {
    const url = 'https://example.blob.vercel-storage.com/recipes/cake.jpg';
    expect(imageSrc(url)).toBe(url);
  });

  it('passes a data: URI through untouched', () => {
    const uri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(imageSrc(uri)).toBe(uri);
  });

  it('wraps legacy raw base64 in a jpeg data URI', () => {
    expect(imageSrc('/9j/4AAQSkZJRg==')).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  });
});
