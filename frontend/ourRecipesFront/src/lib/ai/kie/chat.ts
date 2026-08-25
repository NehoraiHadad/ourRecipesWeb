/**
 * KIE.ai chat client — talks to GPT-5.6 Luna (and siblings) via KIE's Codex
 * `responses` endpoint. This is a different API surface than the Jobs API in
 * `./client.ts` (different root, different request/response envelope), but
 * reuses `KieApiError` so callers handle both failure modes the same way.
 *
 * The endpoint has a baked-in "Codex coding agent" system prompt; `instructions`
 * is the only way to override it, so it is a required field on every call —
 * omitting it would leak the coding-agent persona into recipe text.
 */
import { logger } from '@/lib/logger';
import { KieApiError } from './client';

const CHAT_API_URL = 'https://api.kie.ai/codex/v1/responses';
/** Chat completions can run longer than the Jobs API's per-call budget. */
const HTTP_TIMEOUT_MS = 60_000;

const log = logger.child({ context: 'ai/kie/chat' });

export interface KieChatTextOptions {
  model: string;
  /** Overrides the endpoint's baked-in system prompt. Required — see module docs. */
  instructions: string;
  input: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

interface KieChatContentItem {
  type?: string;
  text?: string;
}

interface KieChatOutputItem {
  type?: string;
  content?: KieChatContentItem[];
}

interface KieChatUsage {
  input_tokens?: number;
  output_tokens?: number;
  output_tokens_details?: { reasoning_tokens?: number };
}

interface KieChatResponseBody {
  output?: KieChatOutputItem[];
  usage?: KieChatUsage;
  // Error shapes seen in practice: {code, msg} and {status, error, message}.
  code?: number;
  msg?: string;
  status?: string;
  error?: string;
  message?: string;
}

/** Reads the API key at call time (never at module load) so tests/cold starts can set it first. */
function getApiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) {
    throw new KieApiError({ method: 'chat', code: 0, description: 'KIE_API_KEY is not configured' });
  }
  return key;
}

function extractText(output: KieChatOutputItem[] | undefined): string {
  return (output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? '')
    .join('');
}

/**
 * Calls KIE's chat endpoint and returns the concatenated assistant text.
 * Throws `KieApiError` on a missing key, a network failure, a non-2xx
 * response, or an empty output — the last is deliberate: an empty answer is
 * as much a failure as an HTTP error for callers that fall back on any throw.
 */
export async function kieChatText({
  model,
  instructions,
  input,
  reasoningEffort = 'low'
}: KieChatTextOptions): Promise<string> {
  const key = getApiKey();

  let response: Response;
  try {
    response = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, instructions, input, reasoning: { effort: reasoningEffort } }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });
  } catch (error) {
    throw new KieApiError({
      method: 'chat',
      code: 0,
      description: error instanceof Error ? error.message : 'Network request failed',
      cause: error
    });
  }

  let body: KieChatResponseBody | null = null;
  try {
    body = (await response.json()) as KieChatResponseBody;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const description = body?.msg ?? body?.message ?? body?.error ?? `HTTP ${response.status}`;
    const error = new KieApiError({ method: 'chat', code: body?.code ?? response.status, description });
    log.warn({ model, code: error.code, description }, 'KIE chat call failed');
    throw error;
  }

  const text = extractText(body?.output);
  if (!text) {
    log.warn({ model }, 'KIE chat call returned empty output text');
    throw new KieApiError({ method: 'chat', code: 0, description: 'KIE chat returned empty output text' });
  }

  log.info({ model, usage: body?.usage }, 'KIE chat call succeeded');
  return text;
}
