import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import './app.css';

function Logo() {
  return (
    <a href="/" className="inline-flex items-center" aria-label="DKU Leadership Resource Bank home">
      <img src="/logo.png" alt="" width={44} height={44} className="rounded-md" />
      <span className="sr-only">DKU Leadership Resource Bank</span>
    </a>
  );
}

function Placeholder({ name, tint }: { name: string; tint: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[1200px] flex-col gap-8 px-6 py-10">
      <Logo />
      <h1 className="font-display" style={{ fontSize: 'var(--fs-display)', color: tint, fontWeight: 600 }}>
        {name}
      </h1>
      <p className="font-body text-ink-soft max-w-[70ch]">
        Build in progress — this placeholder is served with the full token system (fonts, colors, type scale).
      </p>
    </main>
  );
}

const CATS = [
  ['On-Campus Opportunities', '#3E7A5C'],
  ['Fellowships', '#33605B'],
  ['Experiential Programs', '#336472'],
  ['Event & Conference', '#3F5F85'],
  ['Training Programs', '#465891'],
] as const;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder name="DKU Leadership Resource Bank" tint="#1A2B2A" />} />
        <Route path="/resources" element={<Placeholder name="Programs" tint={CATS[0][1]} />} />
        <Route path="/admin" element={<Placeholder name="Admin home" tint="#465891" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
