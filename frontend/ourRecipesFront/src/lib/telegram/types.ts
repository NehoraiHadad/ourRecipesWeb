/**
 * Minimal Telegram Bot API type definitions.
 *
 * Only the objects/fields this project actually consumes are modelled — the
 * real API objects are much larger. Shared here (rather than inside
 * `botApi.ts`) so the webhook handler and the recipe parser can reuse them.
 *
 * @see https://core.telegram.org/bots/api
 */

/** Generic Bot API envelope. Every response has this shape. */
export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: {
    migrate_to_chat_id?: number;
    retry_after?: number;
  };
}

export type TelegramParseMode = 'HTML' | 'Markdown' | 'MarkdownV2';

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel';

export interface TelegramChat {
  id: number;
  type: TelegramChatType;
  title?: string;
  username?: string;
}

/** One size of a photo. Telegram sends an ascending-size array per photo. */
export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  chat: TelegramChat;
  date: number;
  edit_date?: number;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  photo?: TelegramPhotoSize[];
  media_group_id?: string;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

/** Result of `getFile`. `file_path` is relative to the file download root. */
export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export type TelegramChatMemberStatus =
  | 'creator'
  | 'administrator'
  | 'member'
  | 'restricted'
  | 'left'
  | 'kicked';

/**
 * Flattened ChatMember. The API returns one of several variants discriminated
 * by `status`; the admin-only fields are simply absent on the others.
 */
export interface TelegramChatMember {
  status: TelegramChatMemberStatus;
  user: TelegramUser;
  is_anonymous?: boolean;
  custom_title?: string;
  can_be_edited?: boolean;
  can_manage_chat?: boolean;
  can_delete_messages?: boolean;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  can_restrict_members?: boolean;
  can_promote_members?: boolean;
  can_change_info?: boolean;
  can_invite_users?: boolean;
}

/** Chat id: numeric (`-100…` for channels) or `@username`. */
export type TelegramChatId = number | string;

export interface SendMessageParams {
  chat_id: TelegramChatId;
  text: string;
  parse_mode?: TelegramParseMode;
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
  message_thread_id?: number;
}

export interface SendPhotoParams {
  chat_id: TelegramChatId;
  /** file_id, public URL, or a Buffer/Blob for a fresh upload. */
  photo: string | Buffer | Blob;
  caption?: string;
  parse_mode?: TelegramParseMode;
  disable_notification?: boolean;
  reply_to_message_id?: number;
  message_thread_id?: number;
  /** Filename used when `photo` is binary. Defaults to `photo.jpg`. */
  filename?: string;
}

export interface EditMessageTextParams {
  chat_id: TelegramChatId;
  message_id: number;
  text: string;
  parse_mode?: TelegramParseMode;
  disable_web_page_preview?: boolean;
}

export interface EditMessageCaptionParams {
  chat_id: TelegramChatId;
  message_id: number;
  caption?: string;
  parse_mode?: TelegramParseMode;
}

/** Only the photo variant is needed here. */
export interface TelegramInputMediaPhoto {
  type: 'photo';
  /** file_id, public URL, or `attach://<name>` for an uploaded part. */
  media: string;
  caption?: string;
  parse_mode?: TelegramParseMode;
}

export interface EditMessageMediaParams {
  chat_id: TelegramChatId;
  message_id: number;
  media: TelegramInputMediaPhoto;
}

export interface DeleteMessageParams {
  chat_id: TelegramChatId;
  message_id: number;
}

export interface GetChatMemberParams {
  chat_id: TelegramChatId;
  user_id: number | string;
}
