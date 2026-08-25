/**
 * The API routes answer errors in `handleApiError`'s nested shape
 * (`{ error: { message, statusCode } }`), while a couple of handlers — the
 * edge middleware's 401, most notably — still answer flat (`{ message }`).
 * `apiService` has to surface the message either way, otherwise every failed
 * request reaches the UI as the generic "Network response was not ok".
 */
import { describe, it, expect } from 'vitest';
import { extractErrorMessage } from '@/services/apiService';

describe('extractErrorMessage', () => {
  it('reads the nested handleApiError shape', () => {
    expect(extractErrorMessage({ error: { message: 'Recipe not found', statusCode: 404 } })).toBe(
      'Recipe not found'
    );
  });

  it('reads a flat message (middleware 401, ping 503)', () => {
    expect(extractErrorMessage({ authenticated: false, message: 'Invalid or expired token' })).toBe(
      'Invalid or expired token'
    );
  });

  it('reads a plain string error', () => {
    expect(extractErrorMessage({ error: 'Something broke' })).toBe('Something broke');
  });

  it('prefers the nested message when both shapes are present', () => {
    expect(extractErrorMessage({ message: 'outer', error: { message: 'inner' } })).toBe('inner');
  });

  it('falls back for an empty or non-object body', () => {
    expect(extractErrorMessage({})).toBe('Network response was not ok');
    expect(extractErrorMessage(null)).toBe('Network response was not ok');
    expect(extractErrorMessage('boom')).toBe('Network response was not ok');
  });
});
