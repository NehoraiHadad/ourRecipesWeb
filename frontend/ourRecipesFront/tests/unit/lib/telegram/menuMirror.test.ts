/**
 * @vitest-environment node
 *
 * `formatMenuForTelegram` — pure formatting, no network involved.
 */
import { describe, it, expect } from 'vitest';
import { formatMenuForTelegram, type MenuForTelegram } from '@/lib/telegram/menuMirror';

function baseMenu(overrides: Partial<MenuForTelegram> = {}): MenuForTelegram {
  return {
    name: 'תפריט שבת',
    event_type: null,
    total_servings: 4,
    dietary_type: null,
    share_token: 'tok123',
    is_public: false,
    description: null,
    ai_reasoning: null,
    user_id: '111',
    created_at: new Date('2024-01-01T10:00:00Z'),
    meals: [],
    ...overrides
  };
}

describe('formatMenuForTelegram', () => {
  it.each([
    ['MEAT', 'בשרי'],
    ['DAIRY', 'חלבי'],
    ['PAREVE', 'פרווה']
  ] as const)('renders the Hebrew dietary label for %s', (dietaryType, label) => {
    const text = formatMenuForTelegram(baseMenu({ dietary_type: dietaryType }));

    expect(text).toContain(`כשרות: ${label}`);
    // Regression guard: the Flask source this was ported from looked the
    // label up with the lowercase enum value, which never matched — make
    // sure the raw enum value never leaks into the message.
    expect(text).not.toContain(`כשרות: ${dietaryType}`);
    expect(text).not.toContain(`כשרות: ${dietaryType.toLowerCase()}`);
  });

  it('omits the כשרות line entirely when dietary_type is null', () => {
    const text = formatMenuForTelegram(baseMenu({ dietary_type: null }));
    expect(text).not.toContain('כשרות:');
  });
});
