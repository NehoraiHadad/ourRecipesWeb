/**
 * Menu <-> Telegram mirror.
 *
 * Ports `MenuService.format_menu_for_telegram` / `save_to_telegram` /
 * `update_in_telegram` / `delete_from_telegram` from
 * `backend/ourRecipesBack/services/menu_service.py` verbatim. Per
 * ARCHITECTURE §4.3 the DB write always happens first and succeeds on its
 * own — every function here is best-effort: failures are logged and
 * swallowed, never thrown, so a Telegram outage never fails the request.
 */
import { logger } from '@/lib/logger';
import { deleteMessage, editMessageText, sendMessage } from './botApi';
import type { DietaryType } from '@prisma/client';

const log = logger.child({ context: 'telegram/menuMirror' });

export interface MenuRecipeForTelegram {
  recipe_id: number;
  course_type: string | null;
  course_order: number;
  ai_reason: string | null;
  recipe?: { title: string | null } | null;
}

export interface MenuMealForTelegram {
  meal_order: number;
  meal_type: string;
  meal_time: string | null;
  recipes?: MenuRecipeForTelegram[];
}

export interface MenuForTelegram {
  name: string;
  event_type: string | null;
  total_servings: number;
  dietary_type: DietaryType | null;
  share_token: string;
  is_public: boolean;
  description: string | null;
  ai_reasoning: string | null;
  user_id: string;
  created_at: Date;
  meals?: MenuMealForTelegram[];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `%d/%m/%Y %H:%M`, matching Flask's `strftime`. */
function formatCreatedAt(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Verbatim port of `format_menu_for_telegram`.
 *
 * NOTE: preserves a Flask bug as-is — `dietary_labels` is keyed by the
 * uppercase enum member (`'MEAT'`) but looked up with `dietary_type.value`
 * (lowercase `'meat'`), so the Hebrew label never matches and the raw
 * lowercase value is always printed instead. Not fixed here; the goal is a
 * 1:1 port, and this is cosmetic (the message is best-effort output only).
 */
export function formatMenuForTelegram(menu: MenuForTelegram): string {
  const lines: string[] = ['🍽️ תפריט חדש\n'];

  lines.push(`שם: ${menu.name}`);
  if (menu.event_type) lines.push(`אירוע: ${menu.event_type}`);
  lines.push(`סועדים: ${menu.total_servings}`);

  if (menu.dietary_type) {
    const dietaryValue = menu.dietary_type.toLowerCase();
    const dietaryLabels: Record<string, string> = { MEAT: 'בשרי', DAIRY: 'חלבי', PAREVE: 'פרווה' };
    lines.push(`כשרות: ${dietaryLabels[dietaryValue] ?? dietaryValue}`);
  }

  // IMPORTANT: share_token + is_public included so they can be recovered after a DB reset.
  lines.push(`🔗 קוד שיתוף: ${menu.share_token}`);
  lines.push(`🌐 משותף: ${menu.is_public ? 'כן' : 'לא'}`);

  if (menu.description) lines.push(`תיאור: ${menu.description}`);

  lines.push('\n📋 ארוחות:\n');

  const sortedMeals = [...(menu.meals ?? [])].sort((a, b) => a.meal_order - b.meal_order);
  for (const meal of sortedMeals) {
    lines.push(`${meal.meal_order}. ${meal.meal_type}`);
    if (meal.meal_time) lines.push(`   ⏰ ${meal.meal_time}`);

    const sortedRecipes = [...(meal.recipes ?? [])].sort((a, b) => a.course_order - b.course_order);
    for (const mealRecipe of sortedRecipes) {
      const title = mealRecipe.recipe?.title ?? `מתכון #${mealRecipe.recipe_id}`;
      const courseInfo = mealRecipe.course_type ? ` (${mealRecipe.course_type})` : '';
      lines.push(`   • [ID:${mealRecipe.recipe_id}] ${title}${courseInfo}`);
      if (mealRecipe.ai_reason) lines.push(`     💡 ${mealRecipe.ai_reason}`);
    }

    lines.push(''); // Empty line between meals
  }

  if (menu.ai_reasoning) lines.push(`\n💡 למה בחרנו ככה?\n${menu.ai_reasoning}`);

  lines.push(`\n👤 נוצר על ידי: ${menu.user_id}`);
  lines.push(`📅 תאריך יצירה: ${formatCreatedAt(menu.created_at)}`);

  return lines.join('\n');
}

function getChannelId(): string | null {
  const raw = process.env.TELEGRAM_CHANNEL_ID;
  return raw ? raw : null;
}

/** Port of `MenuService.save_to_telegram`. Returns `null` on any failure — never throws. */
export async function mirrorMenuCreate(
  menu: MenuForTelegram
): Promise<{ telegram_message_id: number; last_sync: Date } | null> {
  const channel = getChannelId();
  if (!channel) {
    log.warn('TELEGRAM_CHANNEL_ID is not configured — skipping menu mirror');
    return null;
  }

  try {
    const text = formatMenuForTelegram(menu);
    const message = await sendMessage({ chat_id: channel, text });
    return { telegram_message_id: message.message_id, last_sync: new Date() };
  } catch (error) {
    log.warn({ err: error }, 'Failed to mirror new menu to Telegram');
    return null;
  }
}

/** Port of `MenuService.update_in_telegram`. Returns the new `last_sync`, or `null` on failure/no-op. */
export async function mirrorMenuUpdate(
  menu: MenuForTelegram,
  telegramMessageId: number | null
): Promise<Date | null> {
  if (!telegramMessageId) return null;

  const channel = getChannelId();
  if (!channel) return null;

  try {
    const text = formatMenuForTelegram(menu);
    await editMessageText({ chat_id: channel, message_id: telegramMessageId, text });
    return new Date();
  } catch (error) {
    log.warn({ err: error, telegramMessageId }, 'Failed to mirror menu update to Telegram');
    return null;
  }
}

/** Port of `MenuService.delete_from_telegram`. Never throws. */
export async function mirrorMenuDelete(telegramMessageId: number | null): Promise<void> {
  if (!telegramMessageId) return;

  const channel = getChannelId();
  if (!channel) return;

  try {
    await deleteMessage({ chat_id: channel, message_id: telegramMessageId });
  } catch (error) {
    log.warn({ err: error, telegramMessageId }, 'Failed to delete menu message from Telegram');
  }
}
