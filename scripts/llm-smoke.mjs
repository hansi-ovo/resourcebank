#!/usr/bin/env node
/**
 * Gateway smoke test — verifies the DKU NewAPI gateway works before wiring
 * the real search pipeline (search-upgrade Step 0).
 *
 *   node scripts/llm-smoke.mjs [model]
 *
 * Reads LLM_BASE_URL / LLM_API_KEY / LLM_MODEL from the environment or from
 * `.env` (repo root or server/). Optional CLI arg overrides LLM_MODEL.
 *
 * Checks, in order:
 *   1. GET  /v1/models            → key valid + lists models (flags
 *                                    web-search-capable names)
 *   2. POST /v1/chat/completions  → one real completion ("Reply OK")
 */

import fs from 'node:fs';
import path from 'node:path';

// ── tiny .env loader (mirrors server/src/config.ts; dev only) ──────────
function loadEnv() {
  for (const dir of [process.cwd(), path.resolve(process.cwd(), 'server')]) {
    const file = path.join(dir, '.env');
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const base = (process.env.LLM_BASE_URL || 'https://aichat.dukekunshan.edu.cn:3443/v1').replace(/\/+$/, '');
const key = process.env.LLM_API_KEY || '';
const model = process.argv[2] || process.env.LLM_MODEL || '';

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

if (!key) {
  fail(
    'No LLM_API_KEY found. Create server/.env (repo root also works) with:\n\n' +
      '  LLM_API_KEY=你的网关密钥\n' +
      '  LLM_MODEL=网关里的对话模型名（如 gemini-3.5-flash）\n' +
      '  SEARCH_SOURCE=tavily\n' +
      '  TAVILY_API_KEY=tvly-...（注册 tavily.com 免费获取）\n\n' +
      'Then re-run: node scripts/llm-smoke.mjs',
  );
}

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

// ── 1. list models ─────────────────────────────────────────────────────
let models;
try {
  const res = await fetch(`${base}/models`, { headers });
  if (res.status === 401) fail('HTTP 401 — API key 无效（检查 LLM_API_KEY 是否复制完整）');
  if (!res.ok) fail(`GET /models → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  models = (await res.json()).data?.map((m) => m.id) ?? [];
} catch (err) {
  fail(`无法连接网关 ${base} — ${err.cause?.code || err.message}`);
}

console.log(`✓ 网关可达: ${base}`);
console.log(`✓ Key 有效，共 ${models.length} 个模型:`);
const searchy = /search|sonar|perpl|联网|web|online/i;
for (const id of models) console.log(`   ${searchy.test(id) ? '🔍' : '  '} ${id}`);
const flagged = models.filter((id) => searchy.test(id));
if (flagged.length > 0) {
  console.log(`\n  🔍 = 名字像联网搜索模型，可填入 LLM_SEARCH_MODEL（如: ${flagged.slice(0, 3).join(', ')}）`);
}

// ── 2. one real completion ─────────────────────────────────────────────
if (!model) {
  console.log('\n⚠ 未指定 LLM_MODEL（或命令行参数），跳过 chat 测试。');
  console.log('  用法: node scripts/llm-smoke.mjs <模型名>');
  process.exit(0);
}

console.log(`\n→ 测试 chat 补全（model=${model}）…`);
try {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Reply with exactly: OK' },
      ],
      temperature: 0,
      max_tokens: 512, // reasoning models burn tokens before any content
    }),
  });
  if (res.status === 401) fail('HTTP 401 — key 对该模型无效');
  const bodyText = await res.text();
  if (!res.ok) fail(`HTTP ${res.status} — ${bodyText.slice(0, 200)}（模型 "${model}" 存在？看上面列表里的确切名字）`);
  const reply = JSON.parse(bodyText).choices?.[0]?.message?.content ?? '';
  if (typeof reply !== 'string' || reply.trim().length === 0) {
    fail(`模型回复为空 — "${model}" 可能是推理型模型或网关通道异常，换一个模型再试（如 gemini-3.5-flash / gpt-5.3-chat）`);
  }
  console.log(`✓ 模型回复: ${JSON.stringify(reply)}`);
  console.log('\n✓ 冒烟测试通过 — 可以开工 Step 1 了。');
} catch (err) {
  fail(`chat 请求失败 — ${err.cause?.code || err.message}`);
}
