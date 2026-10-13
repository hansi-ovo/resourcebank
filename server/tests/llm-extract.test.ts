import { describe, expect, it } from 'vitest';
import { LlmError, extractJson } from '../src/providers/llm';

describe('extractJson (LLM reply → JSON value)', () => {
  it('parses a bare JSON object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in ```json fences', () => {
    expect(extractJson('```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
  });

  it('parses JSON embedded after prose', () => {
    expect(extractJson('Here is the result:\n{"ok":true} — hope that helps!')).toEqual({ ok: true });
  });

  it('parses a top-level JSON array', () => {
    expect(extractJson('[{"url":"https://x.org"}]')).toEqual([{ url: 'https://x.org' }]);
  });

  it('throws LlmError when no JSON is present', () => {
    expect(() => extractJson('I cannot help with that.')).toThrow(LlmError);
  });

  it('throws LlmError on truncated JSON', () => {
    expect(() => extractJson('{"a":1')).toThrow(LlmError);
  });

  it('throws LlmError on invalid JSON between brackets', () => {
    expect(() => extractJson('{"a": }')).toThrow(LlmError);
  });
});
