import type { ZodType } from 'zod';
import { config } from '../config';

/**
 * Minimal OpenAI-compatible chat client for the DKU NewAPI gateway
 * (POST {baseUrl}/chat/completions, Bearer key). Zero dependencies —
 * Node 20's global fetch. Used by the real search pipeline for query
 * planning, page extraction, quality scoring, and entity dedup.
 */

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface ChatTextOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

/** A chat completion tuned to return a single JSON value, validated by zod. */
export interface ChatJsonOptions<T> extends ChatTextOptions {
  schema: ZodType<T>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatChoice {
  message?: { content?: string | null };
}

interface ChatResponse {
  choices?: ChatChoice[];
}

const RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class LlmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    public readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  /** Single completion returning raw text. Retries transient failures. */
  async chatText(opts: ChatTextOptions): Promise<string> {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ] satisfies ChatMessage[],
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 2000,
    };

    let lastError: LlmError = new LlmError('LLM request failed');
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt > 0) await sleep(1000 * attempt * attempt); // 1s, 4s backoff
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new LlmError(
            `LLM HTTP ${res.status}: ${text.slice(0, 300)}`,
            res.status,
          );
          if (RETRYABLE_STATUS.has(res.status)) {
            lastError = err;
            continue;
          }
          throw err;
        }
        const data = (await res.json()) as ChatResponse;
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.length === 0) {
          throw new LlmError('LLM returned an empty response');
        }
        return content;
      } catch (err) {
        if (err instanceof LlmError && err.status !== undefined && !RETRYABLE_STATUS.has(err.status)) {
          throw err; // permanent (401/400/404) — retrying cannot help
        }
        lastError =
          err instanceof LlmError
            ? err
            : new LlmError(`LLM request failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  /**
   * Completion that must yield a JSON value matching `schema`. Tries
   * `response_format: json_object` first and falls back to plain prompting
   * when the gateway/model rejects the parameter. Throws LlmError on model
   * refusal, malformed JSON, or schema mismatch — callers decide whether a
   * page is skippable.
   */
  async chatJson<T>(opts: ChatJsonOptions<T>): Promise<T> {
    const jsonSystem = `${opts.system}\n\nRespond with a single JSON value and nothing else — no markdown fences, no commentary.`;
    try {
      return this.parseJson(await this.chatTextRaw(jsonSystem, opts, true), opts.schema);
    } catch (err) {
      // json_object unsupported → retry once without response_format
      if (err instanceof LlmError && err.status === 400) {
        return this.parseJson(await this.chatTextRaw(opts.system, opts, false), opts.schema);
      }
      throw err;
    }
  }

  private async chatTextRaw(system: string, opts: ChatTextOptions, jsonMode: boolean): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: opts.user },
      ] satisfies ChatMessage[],
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 2000,
    };
    if (jsonMode) body.response_format = { type: 'json_object' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new LlmError(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
      }
      const data = (await res.json()) as ChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new LlmError('LLM returned an empty response');
      }
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  private parseJson<T>(raw: string, schema: ZodType<T>): T {
    const parsed = schema.safeParse(extractJson(raw));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new LlmError(`LLM JSON failed schema validation: ${issues.slice(0, 300)}`);
    }
    return parsed.data;
  }
}

/** Pulls the first JSON object/array out of a model reply (fences, prose). */
export function extractJson(raw: string): unknown {
  let text = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fence) text = fence[1].trim();
  const start = text.search(/[{[]/);
  if (start === -1) throw new LlmError('LLM reply contains no JSON');
  const opener = text[start];
  const closer = opener === '{' ? '}' : ']';
  const end = text.lastIndexOf(closer);
  if (end <= start) throw new LlmError('LLM JSON is truncated');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new LlmError('LLM reply is not valid JSON');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Factory from server config; null when the gateway is not configured. */
export function makeLlm(model?: string): LlmClient | null {
  if (!config.llm.apiKey || !config.llm.model) return null;
  return new LlmClient(
    config.llm.baseUrl,
    config.llm.apiKey,
    model || config.llm.model,
    config.llm.timeoutMs,
  );
}
