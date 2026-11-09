import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { makeApp, login, type TestContext } from './harness';
import { extractRedirectTarget, isRedirectStub, type PageFetch } from '../src/routes/import-url';

let ctx: TestContext | null = null;

const PAGE: PageFetch = {
  url: 'https://example.org/program/2027',
  text: 'The Atlas Leadership Fellowship 2027. Fully funded summer program for undergraduate students. Apply by March 15, 2027. Cohort runs June - August 2027 in Singapore. Open to international undergraduates and recent graduates.',
  imageUrl: 'https://example.org/cover.jpg',
  title: 'Atlas Leadership Fellowship 2027',
};

function fakeLlm(reply: unknown) {
  return {
    // biome-ignore lint/suspicious/useAwait: interface is async
    chatJson: async () => reply,
  };
}

function freshWith(overrides: {
  page?: PageFetch | null;
  llm?: unknown | null;
}): TestContext {
  ctx = makeApp({
    searchDelayMs: 300,
    importUrl: {
      // biome-ignore lint/suspicious/useAwait: interface is async
      pageFetcher: async () => overrides.page ?? null,
      llm: overrides.llm === undefined ? null : (overrides.llm as never),
    },
  });
  return ctx;
}

afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

describe('POST /api/import-url (manual-add auto-recognition)', () => {
  it('fills every form field from the fetched page', async () => {
    const { app } = freshWith({
      page: PAGE,
      llm: fakeLlm({
        name: 'Atlas Leadership Fellowship 2027',
        summary:
          'A fully funded summer leadership program in Singapore for undergraduates and recent graduates, running June to August 2027.',
        audience: ['undergraduates', 'recent graduates'],
        startsAt: '2027-06-01',
        endsAt: '2027-03-15',
        timeline: 'Applications close March 15, 2027; cohort June - August 2027',
        category: 'experiential',
        quality: 82,
      }),
    });
    const cookie = await login(app);

    const res = await request(app)
      .post('/api/import-url')
      .set('Cookie', cookie)
      .send({ url: 'https://lnkd.in/dM7SFP3X' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Atlas Leadership Fellowship 2027',
      audience: ['undergraduates', 'recent graduates'],
      timeline: 'Applications close March 15, 2027; cohort June - August 2027',
      category: 'experiential',
      // the fetcher's FINAL url (redirect-resolved) wins, not the short link
      url: 'https://example.org/program/2027',
      imageUrl: 'https://example.org/cover.jpg',
      quality: 82,
    });
  });

  it('unreachable page → 422 with a readable error', async () => {
    const { app } = freshWith({ page: null, llm: fakeLlm({}) });
    const cookie = await login(app);

    const res = await request(app)
      .post('/api/import-url')
      .set('Cookie', cookie)
      .send({ url: 'https://example.org/gone' });

    expect(res.status).toBe(422);
    expect((res.body as { error: string }).error).toMatch(/Could not read that page/);
  });

  it('invalid URL body → 400; unknown category → null, not a 500', async () => {
    const { app } = freshWith({
      page: PAGE,
      llm: fakeLlm({
        name: 'Atlas Leadership Fellowship 2027',
        summary:
          'A fully funded summer leadership program in Singapore for undergraduates and recent graduates, running June to August 2027.',
        audience: [],
        startsAt: null,
        endsAt: null,
        timeline: '',
        category: 'mystery',
        quality: 40,
      }),
    });
    const cookie = await login(app);

    const bad = await request(app).post('/api/import-url').set('Cookie', cookie).send({ url: 'not a url' });
    expect(bad.status).toBe(400);

    const ok = await request(app).post('/api/import-url').set('Cookie', cookie).send({ url: 'https://x.example/1' });
    expect(ok.status).toBe(200);
    expect((ok.body as { category: string | null }).category).toBeNull();
    // dates fall back into the timeline text so nothing is lost in manual add
    expect((ok.body as { timeline: string }).timeline).toBe('');
  });

  it('without an LLM the endpoint reports 503 (offline tests / unconfigured dev)', async () => {
    // llm: null forces the unconfigured-gateway path hermetically (the dev
    // repo .env carries real LLM keys — makeLlm() there would call the
    // network, which a unit test must never do).
    const { app } = freshWith({ page: PAGE, llm: null });
    const cookie = await login(app);

    const res = await request(app)
      .post('/api/import-url')
      .set('Cookie', cookie)
      .send({ url: 'https://example.org/x' });
    expect(res.status).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/unavailable/i);
  });
});

describe('redirect-stub following (lnkd.in / inkd.in interstitials)', () => {
  const STUB_HTML = `
    <html><head>
      <meta name="pageKey" content="d_shortlink_frontend_external_link_redirect_interstitial">
      <link rel="icon" href="https://static.licdn.cn/aero-v1/sc/h/al2o9zrvru7aqj8e1x2rzsrca">
      <script src="https://www.linkedin.com/x.js"></script>
    </head><body>
      <a href="https://docs.google.com/forms/d/e/1FAIpQLSf5se7f/viewform&amp;embedded=true">Continue</a>
    </body></html>`;

  it('isRedirectStub detects the LinkedIn interstitial pageKey and near-empty pages', () => {
    const RICH = 'A real program page with plenty of visible text. '.repeat(12); // >250 chars
    expect(isRedirectStub({ url: 'https://example.org/p', text: RICH } as PageFetch)).toBe(false);
    expect(
      isRedirectStub({
        url: 'https://lnkd.in/x',
        text: 'Continue to the destination', // short + interstitial pageKey
        rawHtml: STUB_HTML,
      } as PageFetch & { rawHtml: string }),
    ).toBe(true);
    expect(isRedirectStub({ url: 'https://x.org', text: '   ' } as PageFetch)).toBe(true);
    // short page WITHOUT the pageKey is still treated as a stub (empty shell)
    expect(isRedirectStub({ url: 'https://x.org', text: 'Loading...' } as PageFetch)).toBe(true);
  });

  it('extractRedirectTarget pulls the external URL out of the stub HTML', () => {
    const target = extractRedirectTarget(STUB_HTML, 'https://lnkd.in/dM7SFP3X');
    expect(target).toBe('https://docs.google.com/forms/d/e/1FAIpQLSf5se7f/viewform&embedded=true');
  });

  it('extractRedirectTarget ignores assets and LinkedIn-internal URLs', () => {
    const html =
      '<img src="https://example.org/a.png"><a href="https://www.linkedin.com/feed/">x</a>' +
      '<a href="https://programs.example.org/apply">Go</a>';
    expect(extractRedirectTarget(html, 'https://lnkd.in/x')).toBe('https://programs.example.org/apply');
  });

  it('extractRedirectTarget returns null when no external target exists', () => {
    const html = '<a href="https://www.linkedin.com/posts/x">only LinkedIn</a>';
    expect(extractRedirectTarget(html, 'https://lnkd.in/x')).toBeNull();
  });
});
